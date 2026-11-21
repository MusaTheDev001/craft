/**
 * In-memory sliding-window rate limiter.
 *
 * Suitable for single-instance / local-dev use.
 * In production with multiple replicas, swap the store for a shared
 * Redis/Upstash backend — the RateLimiter interface stays the same.
 *
 * Configuration
 * ─────────────
 * Each "limit config" defines:
 *   - limit      : max requests allowed in the window
 *   - windowMs   : rolling window length in milliseconds
 *
 * Request key
 * ───────────
 * Keys are derived from the client IP combined with a route identifier so
 * limits are scoped per-endpoint, not globally (format: `route:ip`).
 *
 * Trusted-proxy assumption
 * ────────────────────────
 * `x-forwarded-for` is client-appendable, so the leftmost entry is NOT
 * trustworthy — an arbitrary caller can prepend any value to dodge the
 * limiter. We instead read the header from the trusted (right) end: the
 * entry `RATE_LIMIT_TRUSTED_PROXY_HOPS` hops from the right (default 1),
 * i.e. the address appended by the last trusted proxy in front of the app.
 * Set RATE_LIMIT_TRUSTED_PROXY_HOPS to the number of proxies you operate
 * (e.g. 2 for a CDN in front of a load balancer). If the header has fewer
 * entries than that, we fall back to `x-real-ip`.
 *
 * Header-less fallback
 * ────────────────────
 * When neither `x-forwarded-for` nor `x-real-ip` yields an address, we do
 * NOT collapse every such client into a single shared bucket. Instead we
 * derive a stable identifier from a hash of `user-agent` + `accept-language`
 * (or a fixed default when both are absent) so anonymous clients spread
 * across buckets. A one-time warning is logged when this fallback is used.
 *
 * Local development
 * ─────────────────
 * Set RATE_LIMIT_DISABLED=true in .env.local to bypass all checks.
 * Thresholds are intentionally generous in dev to avoid friction.
 *
 * See "Rate Limiting, Idempotency, and Tier Enforcement" in CONTRIBUTING.md
 * for the full env-var reference.
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /** Rolling window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Unix timestamp (ms) when the oldest request in the window expires. */
  resetAt: number;
  /** How many ms until the window resets (convenience alias). */
  retryAfterMs: number;
}

// ── Pre-defined configs per endpoint type ────────────────────────────────────

/** Strict limit for credential submission (sign-in / sign-up). */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowMs: 15 * 60 * 1000, // 10 attempts per 15 minutes
};

/** Lighter limit for read-only auth endpoints (user, profile). */
export const AUTH_READ_RATE_LIMIT: RateLimitConfig = {
  limit: 60,
  windowMs: 60 * 1000, // 60 requests per minute
};

/** General API endpoints (templates, deployments, analytics). */
export const API_RATE_LIMIT: RateLimitConfig = {
  limit: 120,
  windowMs: 60 * 1000, // 120 requests per minute
};

/** Mutation endpoints (create/update/delete deployments, drafts). */
export const MUTATION_RATE_LIMIT: RateLimitConfig = {
  limit: 30,
  windowMs: 60 * 1000, // 30 mutations per minute
};

/** Webhook endpoints — high throughput, verified by signature. */
export const WEBHOOK_RATE_LIMIT: RateLimitConfig = {
  limit: 500,
  windowMs: 60 * 1000, // 500 per minute
};

/** Cron endpoints — called by Vercel Cron, very low expected volume. */
export const CRON_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowMs: 60 * 1000, // 10 per minute
};

// ── Store ────────────────────────────────────────────────────────────────────

interface RateLimitEntry {
  /** Sorted list of request timestamps (ms) within the window. */
  timestamps: number[];
  /** Rolling window length (ms) — retained so expired entries can be swept. */
  windowMs: number;
}

// Map<key, entry> — each entry tracks its own window so a low-frequency sweep
// can evict fully-expired entries independent of fresh traffic on that key.
const store = new Map<string, RateLimitEntry>();

// ── Bounded growth ───────────────────────────────────────────────────────────

// Lazily-triggered sweep that evicts fully-expired entries. This bounds memory
// growth from one-off clients (scanners, bots, rotating CDN/proxy IPs) that make
// a single request and never return — their entry would otherwise linger until
// the next request on that key, which may never come.
const SWEEP_INTERVAL_CALLS = parseInt(
  process.env.RATE_LIMIT_SWEEP_INTERVAL ?? '1000',
  10,
);
const SWEEP_EVERY =
  Number.isFinite(SWEEP_INTERVAL_CALLS) && SWEEP_INTERVAL_CALLS > 0
    ? SWEEP_INTERVAL_CALLS
    : 1000;

let callCount = 0;

function sweepStore(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    const windowStart = now - entry.windowMs;
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

function maybeSweep(): void {
  callCount += 1;
  if (callCount % SWEEP_EVERY === 0) sweepStore();
}

// ── Core logic ───────────────────────────────────────────────────────────────

/**
 * Check and record a request against the rate limit for the given key.
 * Pure function over the shared store — no I/O.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Retrieve and prune timestamps outside the current window.
  const existing = store.get(key);
  const timestamps = (existing?.timestamps ?? []).filter((t) => t > windowStart);

  const allowed = timestamps.length < config.limit;

  if (allowed) {
    timestamps.push(now);
    store.set(key, { timestamps, windowMs: config.windowMs });
  } else if (timestamps.length === 0) {
    // Pruning left nothing and the request was not allowed to extend the
    // window — drop the stale empty entry rather than leaving it behind.
    store.delete(key);
  }

  const oldest = timestamps[0] ?? now;
  const resetAt = oldest + config.windowMs;

  maybeSweep();

  return {
    allowed,
    remaining: Math.max(0, config.limit - timestamps.length),
    resetAt,
    retryAfterMs: Math.max(0, resetAt - now),
  };
}

// ── Client identification ────────────────────────────────────────────────────

/**
 * Number of trusted proxies in front of the app. The client IP is the entry
 * this many hops from the right of `x-forwarded-for`. Defaults to 1.
 */
function parseTrustedProxyHops(raw: string | undefined): number {
  const parsed = parseInt(raw ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

const TRUSTED_PROXY_HOPS = parseTrustedProxyHops(
  process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS,
);

let warnedAboutFallback = false;

/** Stable, non-reversible identifier for header-less clients. */
function hashFallbackIdentity(req: {
  headers: { get(name: string): string | null };
}): string {
  const userAgent = req.headers.get('user-agent') ?? '';
  const acceptLanguage = req.headers.get('accept-language') ?? '';
  const source = userAgent || acceptLanguage ? `${userAgent}|${acceptLanguage}` : 'anonymous';

  // FNV-1a 32-bit hash — deterministic and dependency-free.
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `anon-${(hash >>> 0).toString(16)}`;
}

/**
 * Derive a stable rate-limit key from a Next.js request and a route label.
 *
 * Priority: x-forwarded-for (trusted end) → x-real-ip → hashed fallback.
 */
export function getRateLimitKey(req: { headers: { get(name: string): string | null } }, route: string): string {
  const forwarded = req.headers.get('x-forwarded-for');
  let ip: string | undefined;

  if (forwarded) {
    const entries = forwarded
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (entries.length >= TRUSTED_PROXY_HOPS) {
      ip = entries[entries.length - TRUSTED_PROXY_HOPS];
    }
  }

  if (!ip) {
    const realIp = req.headers.get('x-real-ip')?.trim();
    if (realIp) ip = realIp;
  }

  if (!ip) {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn(
        '[rate-limit] No client IP in x-forwarded-for/x-real-ip; ' +
          'falling back to a hashed user-agent/accept-language identifier.',
      );
    }
    ip = hashFallbackIdentity(req);
  }

  return `${route}:${ip}`;
}

/** Clears the in-memory store — intended for use in tests only. */
export function _resetStore(): void {
  store.clear();
}

/** Resets the one-time fallback warning flag — intended for use in tests only. */
export function _resetFallbackWarning(): void {
  warnedAboutFallback = false;
}

/** Returns the number of keys currently held in the store — for tests/observability. */
export function _storeSize(): number {
  return store.size;
}

/** Force an immediate sweep of fully-expired entries — exposed for tests. */
export function _sweepStore(): void {
  sweepStore();
}
