/**
 * Stellar Horizon API Client with Adaptive Retry and Circuit Breaker (#787)
 *
 * Wraps raw Horizon HTTP calls with:
 * - Adaptive backoff: respects X-RateLimit-Remaining / X-RateLimit-Reset
 * - Circuit breaker: opens after 5 failures within the failure window (default 30 s),
 *   half-opens after 60 s
 * - Retry budget: maximum 3 retries per request regardless of rate-limit headroom
 * - Logging: each retry is logged to the analytics service
 *
 * Retryable failures are limited to network errors, HTTP 429 (Too Many Requests)
 * and HTTP 5xx (server errors). Other 4xx responses (e.g. 400, 404) are
 * non-retryable: they are thrown immediately after a single attempt and are not
 * counted as circuit failures.
 */

import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HorizonResponse<T = unknown> {
  data: T;
  headers: Record<string, string>;
}

export interface RetryLog {
  attempt: number;
  delayMs: number;
  reason: string;
}

export interface HorizonClientOptions {
  /** Base URL of the Horizon server, e.g. https://horizon.stellar.org */
  baseUrl: string;
  /** Maximum retries per request (default: 3). */
  maxRetries?: number;
  /** Number of failures in the window to open the circuit (default: 5). */
  circuitOpenThreshold?: number;
  /** Sliding window in ms for counting failures (default: 30_000). */
  circuitWindowMs?: number;
  /** Time in ms before a half-open probe is attempted (default: 60_000). */
  circuitRecoveryMs?: number;
  /** Called for each retry attempt for observability. */
  onRetry?: (log: RetryLog) => void;
  /** Injected fetch for unit testing (default: global fetch). */
  _fetch?: typeof fetch;
}

export interface RequestOptions {
  /** HTTP method (default: 'GET'). */
  method?: string;
  /** Request body for POST/PUT/PATCH requests. */
  body?: BodyInit;
  /** Additional request headers. */
  headers?: Record<string, string>;
}

/** Request body type (same as fetch BodyInit). */
export type BodyInit = string | Uint8Array | ReadableStream<Uint8Array> | FormData | URLSearchParams;

// ── Adaptive retry helper ──────────────────────────────────────────────────────

/**
 * Upper bound for the rate-limit-derived backoff delay.
 *
 * The X-RateLimit-Reset header is server-supplied and can be far in the future
 * because of a Horizon anomaly, a misbehaving proxy, or clock drift between the
 * client and the server. Without a ceiling, a single retry attempt could block
 * the caller for minutes or hours. Cap it at a few seconds so a retry never
 * outlives a reasonable request timeout.
 */
export const MAX_BACKOFF_DELAY_MS = 5_000;

/**
 * Returns true when an HTTP status code is worth retrying.
 *
 * Only 429 (Too Many Requests) and 5xx (server errors) are retryable. All other
 * 4xx responses are client errors that will not succeed on retry, so they are
 * thrown immediately and excluded from circuit failure counting.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Computes the backoff delay in ms for a given response.
 *
 * - If X-RateLimit-Remaining < 10, delays until X-RateLimit-Reset (epoch seconds),
 *   clamped to {@link MAX_BACKOFF_DELAY_MS}.
 * - Otherwise uses exponential backoff: 200 * 2^attempt ms.
 */
export function computeBackoffMs(
  headers: Record<string, string>,
  attempt: number,
): { delayMs: number; reason: string } {
  const remaining = parseInt(headers['x-ratelimit-remaining'] ?? '999', 10);
  const reset = parseInt(headers['x-ratelimit-reset'] ?? '0', 10);

  if (remaining < 10 && reset > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    const uncappedDelayMs = Math.max(0, (reset - nowSec) * 1000);
    const delayMs = Math.min(uncappedDelayMs, MAX_BACKOFF_DELAY_MS);
    const capped = delayMs < uncappedDelayMs;
    const reason =
      `rate_limit_low_remaining (${remaining} left, reset in ${reset - nowSec}s` +
      (capped ? `, capped ${uncappedDelayMs}ms->${delayMs}ms)` : `)`);
    return { delayMs, reason };
  }

  const delayMs = 200 * Math.pow(2, attempt);
  return { delayMs, reason: `exponential_backoff (attempt ${attempt})` };
}

// ── HorizonClient ─────────────────────────────────────────────────────────────

export class HorizonClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly onRetry: ((log: RetryLog) => void) | undefined;
  private readonly _fetch: typeof fetch;
  readonly circuit: CircuitBreaker;

  constructor(options: HorizonClientOptions) {
    const baseUrl = options.baseUrl?.replace(/\/+$/, '');
    if (!baseUrl) throw new Error('baseUrl is required');
    this.baseUrl = baseUrl;
    this.maxRetries = options.maxRetries ?? 3;
    this.onRetry = options.onRetry;
    this._fetch = options._fetch ?? globalThis.fetch;
    this.circuit = new CircuitBreaker({
      name: 'horizon',
      failureThreshold: options.circuitOpenThreshold ?? 5,
      resetTimeoutMs: options.circuitRecoveryMs ?? 60_000,
      failureWindowMs: options.circuitWindowMs ?? 30_000,
    });
  }

  /**
   * Performs an HTTP request with adaptive retry and circuit breaker protection.
   *
   * Supports any HTTP method and applies identical circuit-breaker/retry/backoff logic
   * regardless of method. Note that retry-safety for non-idempotent methods (POST) depends
   * on server-side deduplication (e.g., Horizon's dedupe-by-hash behavior for transactions).
   *
   * Only network errors, HTTP 429 and HTTP 5xx responses are retried and counted as
   * circuit failures. Other 4xx responses are thrown immediately after a single
   * attempt without affecting the circuit breaker.
   *
   * @param path - URL path relative to baseUrl
   * @param options - Request options (method, body, headers)
   * @throws {CircuitOpenError} When the circuit is open. The error exposes the
   *   remaining wait time via `retryAfterMs` (if available).
   * @throws {Error} When all retries are exhausted or a non-retryable error occurs.
   */
  async request<T>(path: string, options?: RequestOptions): Promise<HorizonResponse<T>> {
    if (this.circuit.isOpen()) {
      throw new CircuitOpenError(
        'Circuit breaker is open. Horizon requests are suspended.',
        this.circuit.getRemainingOpenMs?.(),
      );
    }

    const url = `${this.baseUrl}${path}`;
    const method = options?.method ?? 'GET';
    let attempt = 0;
    let lastHeaders: Record<string, string> = {};

    while (true) {
      try {
        const fetchOptions: RequestInit = {
          method,
          headers: options?.headers ?? {},
        };
        if (options?.body !== undefined) {
          fetchOptions.body = options.body;
        }

        const res = await this._fetch(url, fetchOptions);
        const headers = extractHeaders(res.headers);
        lastHeaders = headers;

        if (res.ok) {
          // Parse the body before recording success so a JSON parse failure
          // is counted as exactly one failure (not a success + a failure).
          const data = (await res.json()) as T;
          this.circuit.recordSuccess();
          return { data, headers };
        }

        const err = new Error(`Horizon returned HTTP ${res.status} for ${path}`);
        Object.assign(err, { status: res.status, headers });

        // Non-retryable client errors (e.g. 400, 404) are thrown immediately
        // and must not count toward the circuit failure budget.
        if (!isRetryableStatus(res.status)) {
          throw err;
        }

        throw err;
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        const retryable = status === undefined || isRetryableStatus(status);

        if (!retryable) {
          throw err;
        }

        this.circuit.recordFailure();

        if (attempt >= this.maxRetries || this.circuit.isOpen()) {
          throw err;
        }

        const { delayMs, reason } = computeBackoffMs(lastHeaders, attempt);
        this.onRetry?.({ attempt: attempt + 1, delayMs, reason });
        await sleep(delayMs);
        attempt++;
      }
    }
  }

  /**
   * Performs an HTTP GET with adaptive retry and circuit breaker protection.
   *
   * Thin wra

/* … truncated 224 chars — edit only what you need near the top … */
