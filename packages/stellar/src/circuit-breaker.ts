/**
 * Unified Circuit Breaker Pattern for External Service Calls
 *
 * Prevents cascading failures by stopping calls to a service that is
 * consistently failing, giving it time to recover.
 *
 * States:
 *   CLOSED    — normal operation; failures are counted
 *   OPEN      — calls are rejected immediately (fast-fail)
 *   HALF_OPEN — one probe call is allowed through to test recovery
 *
 * Transitions:
 *   CLOSED  → OPEN      when failureCount >= failureThreshold
 *   OPEN    → HALF_OPEN after resetTimeoutMs has elapsed
 *   HALF_OPEN → CLOSED  on probe success
 *   HALF_OPEN → OPEN    on probe failure (resets the timeout)
 *
 * Failure window:
 *   When `failureWindowMs` is set, failures older than the window are
 *   discarded before counting, so the threshold must be reached within
 *   that window. When unset, failures accumulate until a success resets
 *   them (the default behaviour).
 *
 * Supports two usage patterns:
 *   1. Functional wrapper: await breaker.call(() => someAsyncFn())
 *   2. Manual state checks: isOpen(), recordSuccess(), recordFailure()
 *
 * @example
 * // Functional API (recommended)
 * const breaker = new CircuitBreaker({ name: 'github' });
 * const result = await breaker.call(() => githubService.createRepo(...));
 *
 * @example
 * // Manual state API
 * const breaker = new CircuitBreaker({ name: 'horizon' });
 * if (breaker.isOpen()) throw new Error('Service unavailable');
 * try {
 *   await horizonService.request();
 *   breaker.recordSuccess();
 * } catch (err) {
 *   breaker.recordFailure();
 *   throw err;
 * }
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Human-readable name used in error messages. */
  name: string;
  /**
   * Number of consecutive failures before opening. Default: 5
   * Must be a positive integer (>= 1). Non-integer or non-positive values
   * throw a `RangeError` at construction.
   */
  failureThreshold?: number;
  /**
   * How long (ms) to wait in OPEN before allowing a probe. Default: 30_000
   * Must be a positive integer (>= 1). Non-integer or non-positive values
   * throw a `RangeError` at construction.
   */
  resetTimeoutMs?: number;
  /**
   * Failure counting window (ms). Failures older than this are discarded
   * before counting. When omitted, failures accumulate until a success.
   */
  failureWindowMs?: number;
  /** Injected clock — override in tests. Default: Date.now */
  now?: () => number;
  /** Called whenever the circuit transitions between states. */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState, metadata?: Record<string, unknown>) => void;
}

/** Thrown when a call is rejected because the circuit is OPEN. */
export class CircuitOpenError extends Error {
  /** Remaining wait time (ms) before the circuit may allow a probe. */
  readonly retryAfterMs: number;

  constructor(name: string, retryAfterMs: number) {
    super(`Circuit "${name}" is OPEN — retry after ${retryAfterMs}ms`);
    this.name = 'CircuitOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private openedAt: number | null = null;
  private failureTimestamps: number[] = [];

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly failureWindowMs?: number;
  private readonly now: () => number;
  private readonly onStateChange?: CircuitBreakerConfig['onStateChange'];
  readonly name: string;

  constructor(config: CircuitBreakerConfig) {
    this.name = config.name;
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30_000;

    assertPositiveInteger(this.failureThreshold, 'failureThreshold');
    assertPositiveInteger(this.resetTimeoutMs, 'resetTimeoutMs');

    this.failureWindowMs = config.failureWindowMs;
    this.now = config.now ?? Date.now;
    this.onStateChange = config.onStateChange;
  }

  get currentState(): CircuitState {
    return this.state;
  }

  /**
   * Execute `fn` through the circuit breaker (functional API).
   * Throws `CircuitOpenError` immediately when the circuit is OPEN.
   *
   * @param fn - Async function to execute
   * @returns Result of fn
   * @throws CircuitOpenError when the circuit is OPEN
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    this.transitionIfDue();

    if (this.state === 'OPEN') {
      throw new CircuitOpenError(this.name, this.retryAfterMs());
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Check if the circuit is currently OPEN (manual state API).
   *
   * @returns true if the circuit is OPEN
   */
  isOpen(): boolean {
    this.transitionIfDue();
    return this.state === 'OPEN';
  }

  /**
   * Get the current state (manual state API).
   *
   * @returns Current circuit state
   */
  getState(): CircuitState {
    this.transitionIfDue();
    return this.state;
  }

  /**
   * Get the remaining wait time (ms) before the circuit may allow a probe.
   * Returns 0 when the circuit is not OPEN.
   *
   * @returns Remaining retry-after time in milliseconds
   */
  getRetryAfterMs(): number {
    this.transitionIfDue();
    return this.retryAfterMs();
  }

  /**
   * Record a successful call (manual state API).
   * Resets failure count and transitions to CLOSED.
   */
  recordSuccess(): void {
    this.onSuccess();
  }

  /**
   * Record a failed call (manual state API).
   * Increments failure count and may transition to OPEN.
   */
  recordFailure(): void {
    this.onFailure();
  }

  /** Manually reset to CLOSED (e.g. after a config change). */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.openedAt = null;
    this.failureTimestamps = [];
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private retryAfterMs(): number {
    if (this.state !== 'OPEN' || this.openedAt === null) return 0;
    return Math.max(0, this.openedAt + this.resetTimeoutMs - this.now());
  }

  private transitionIfDue(): void {
    if (this.state === 'OPEN' && this.openedAt !== null) {
      if (this.now() - this.openedAt >= this.resetTimeoutMs) {
        this.transition('HALF_OPEN', { waitedMs: this.now() - this.openedAt });
      }
    }
  }

  private onSuccess(): void {
    const prev = this.state;
    this.failureCount = 0;
    this.failureTimestamps = [];
    this.openedAt = null;
    this.state = 'CLOSED';
    if (prev !== 'CLOSED') this.onStateChange?.(this.name, prev, 'CLOSED');
  }

  private onFailure(): void {
    const now = this.now();

    if (this.failureWindowMs !== undefined) {
      const cutoff = now - this.failureWindowMs;
      this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > cutoff);
      this.failureTimestamps.push(now);
      this.failureCount = this.failureTimestamps.length;
    } else {
      this.failureCount += 1;
    }

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      const prev = this.state;
      this.state = 'OPEN';
      this.openedAt = now;
      this.failureCount = 0;
      this.failureTimestamps = [];
      this.onStateChange?.(this.name, prev, 'OPEN', { resetTimeoutMs: this.resetTimeoutMs });
    }
  }

  private transition(to: CircuitState, metadata?: Record<string, unknown>): void {
    const from = this.state;
    this.state = to;
    this.onStateChange?.(this.name, from, to, metadata);
  }
}

/**
 * Assert that `value` is a positive integer (>= 1).
 * Throws a `RangeError` for non-integer, non-positive, or `NaN` values.
 */
function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(
      `CircuitBreaker config "${field}" must be a positive integer, received ${value}`,
    );
  }
}
