/**
 * Request deduplication middleware using client-supplied idempotency keys.
 *
 * Reads the `Idempotency-Key` header on incoming requests. When a key is
 * present and a response for the same (userId, key) pair has been stored
 * within the TTL window, the cached response is returned immediately without
 * executing the handler again.
 *
 * Cache entries are scoped per authenticated user — keys from different users
 * never collide even if the raw key string is identical.
 *
 * In-flight deduplication:
 *   The cache is only populated after a handler finishes, so two simultaneous
 *   requests carrying the same key would otherwise both execute the handler
 *   (e.g. creating two checkouts). To prevent this, the first request to miss
 *   the cache registers its handler promise in an in-flight map keyed by the
 *   same (userId, key) pair. Any duplicate request that arrives while that
 *   promise is pending awaits it and returns a cloned response instead of
 *   invoking the handler again. The in-flight entry is removed in a `finally`
 *   block once the handler settles, at which point the cached response (if
 *   cacheable) serves subsequent requests.
 *
 * Caching policy:
 *   - 2xx (200-299): Always cached (successful responses)
 *   - 4xx (400-499): Cached for permanent client errors (400, 401, 403, 404, 422, etc.)
 *                    NOT cached for transient errors (408, 429)
 *   - 5xx (500-599): Never cached (transient server errors that may succeed on retry)
 *
 * Configuration:
 *   IDEMPOTENCY_TTL_MS      — Cache TTL in milliseconds. Default: 86_400_000 (24 h)
 *   IDEMPOTENCY_MAX_ENTRIES — Hard cap on cached entries; when exceeded the
 *                             oldest entry (by storedAt) is evicted. Default: 10_000
 *   IDEMPOTENCY_SWEEP_MS    — Interval at which a background sweep evicts
 *                             expired entries independently of new keyed
 *                             requests, bounding memory even for one-shot keys.
 *                             Default: 60_000 (60 s). Disabled under NODE_ENV=test.
 *
 * Eviction strategy:
 *   - Every keyed request that misses the cache prunes expired entries first
 *     (lazy sweep), so a hot key never accumulates stale data.
 *   - A periodic background sweep runs on an interval to evict entries that
 *     have fully expired even when no further request arrives on that key
 *     (the common one-shot checkout case), preventing unbounded growth.
 *   - A max-size cap provides a hard backstop: if the sweep lags, the oldest
 *     stored entry is evicted on write.
 *
 * Usage:
 *   const handler = withIdempotency(userId, async (req) => { ... });
 *   return handler(req);
 *
 * See "Rate Limiting, Idempotency, and Tier Enforcement" in CONTRIBUTING.md
 * for the full env-var reference.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Maximum accepted length of an `Idempotency-Key` header value. */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

/** Matches 1-255 printable ASCII characters (0x20-0x7E). */
const IDEMPOTENCY_KEY_PATTERN = /^[\x20-\x7E]{1,255}$/;

/** Headers that must never be cached or replayed. */
const UNSAFE_RESPONSE_HEADERS = new Set(['set-cookie', 'set-cookie2']);

interface CachedResponse {
    status: number;
    body: unknown;
    /** True when the stored body was plain text rather than JSON. */
    isText: boolean;
    /** Filtered copy of safe response headers. */
    headers: Record<string, string>;
    storedAt: number;
}

/**
 * Validate an `Idempotency-Key` header value.
 * @returns An error message when invalid, or `null` when the key is acceptable.
 */
function validateIdempotencyKey(rawKey: string): string | null {
    if (rawKey.length === 0) {
        return `Invalid ${IDEMPOTENCY_KEY_HEADER} header: must be 1-${IDEMPOTENCY_KEY_MAX_LENGTH} printable ASCII characters.`;
    }
    if (rawKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
        return `Invalid ${IDEMPOTENCY_KEY_HEADER} header: must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`;
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(rawKey)) {
        return `Invalid ${IDEMPOTENCY_KEY_HEADER} header: must contain only printable ASCII characters.`;
    }
    return null;
}

/** Collect a filtered copy of safe response headers for caching. */
function safeHeaders(response: NextResponse): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
        if (UNSAFE_RESPONSE_HEADERS.has(name.toLowerCase())) return;
        headers[name] = value;
    });
    return headers;
}

// Module-level cache: survives across requests within a process.
const cache = new Map<string, CachedResponse>();

// In-flight handler executions keyed by the same cache key. Prevents two
// concurrent requests with the same idempotency key from both running the
// handler before either result has been cached.
const inFlight = new Map<string, Promise<NextResponse>>();

function ttlMs(): number {
    const val = parseInt(process.env.IDEMPOTENCY_TTL_MS ?? '86400000', 10);
    return Number.isFinite(val) && val > 0 ? val : 86_400_000;
}

function maxEntries(): number {
    const val = parseInt(process.env.IDEMPOTENCY_MAX_ENTRIES ?? '10000', 10);
    return Number.isFinite(val) && val > 0 ? val : 10_000;
}

function sweepIntervalMs(): number {
    const val = parseInt(process.env.IDEMPOTENCY_SWEEP_MS ?? '60000', 10);
    return Number.isFinite(val) && val > 0 ? val : 60_000;
}

function cacheKey(userId: string, idempotencyKey: string): string {
    return `${userId}:${idempotencyKey}`;
}

/**
 * Determine if a response status code should be cached.
 * - 2xx: Always cached (success)
 * - 4xx: Cached for permanent errors (400, 401, 403, 404, 422, etc.)
 *        NOT cached for transient errors (408, 429)
 * - 5xx: Never cached (transient server errors)
 */
function shouldCacheResponse(status: number): boolean {
    if (status >= 200 && status < 300) return true;
    if (status >= 400 && status < 500) {
        const transientClientErrors = new Set([408, 429]);
        return !transientClientErrors.has(status);
    }
    return false;
}

/** Remove every cache entry whose TTL has elapsed. */
export function evictExpired(): void {
    const now = Date.now();
    const ttl = ttlMs();
    for (const [key, entry] of cache) {
        if (now - entry.storedAt > ttl) cache.delete(key);
    }
}

/**
 * Bound the cache size by evicting the oldest entry when over the cap. Used as
 * a backstop so memory stays bounded even if the periodic sweep has not yet
 * reclaimed entries.
 */
function enforceMaxSize(): void {
    const cap = maxEntries();
    if (cache.size <= cap) return;
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of cache) {
        if (entry.storedAt < oldestTime) {
            oldestTime = entry.storedAt;
            oldestKey = key;
        }
    }
    if (oldestKey) cache.delete(oldestKey);
}

// ── Periodic sweep ────────────────────────────────────────────────────────────
// Evicts expired entries on a timer so the cache cannot grow without bound for
// one-shot keys that are never re-requested. Disabled under test environments
// to avoid open-handle leaks in the test runner.

let sweepHandle: ReturnType<typeof setInterval> | null = null;

function startSweep(): void {
    if (sweepHandle) return;
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    sweepHandle = setInterval(() => {
        evictExpired();
    }, sweepIntervalMs());
}

export type IdempotentHandler = (req: NextRequest) => Promise<NextResponse>;

/**
 * Wrap a handler with idempotency deduplication.
 * If the request carries an `Idempotency-Key` header and a cached response
 * exists for (userId, key), returns the cached response. Otherwise executes
 * the handler and caches a 2xx response.
 */
export function withIdempotency(
    userId: string,
    handler: IdempotentHandler,
): IdempotentHandler {
    return async (req: NextRequest): Promise<NextResponse> => {
        startSweep();
        const rawKey = req.headers.get(IDEMPOTENCY_KEY_HEADER);
        if (!rawKey) return handler(req);

        const keyError = validateIdempotencyKey(rawKey);
        if (keyError) {
            return NextResponse.json({ error: keyError }, { status: 400 });
        }

        evictExpired();

        const key = cacheKey(userId, rawKey);
        const cached = cache.get(key);

        if (cached && Date.now() - cached.storedAt <= ttlMs()) {
            const headers = { ...cached.headers, 'Idempotent-Replayed': 'true' };
            if (cached.isText) {
                return new NextResponse(String(cached.body), {
                    status: cached.status,
                    headers,
                });
            }
            return NextResponse.json(cached.body, {
                status: cached.status,
                headers,
            });
        }

        // A duplicate request arrived while the original is still executing:
        // await the shared promise and return a cloned response rather than
        // running the handler a second time.
        const pending = inFlight.get(key);
        if (pending) {
            const response = await pending;
            return response.clone();
        }

        const execution = (async (): Promise<NextResponse> => {
            const response = await handler(req);

            if (shouldCacheResponse(response.status)) {
                const body = await response.clone().json().catch(() => null);
                if (cache.size >= maxEntries()) evictExpired();
                cache.set(key, { status: response.status, body, storedAt: Date.now() });
                enforceMaxSize();
            }

            return response;
        })();

        inFlight.set(key, execution);

        try {
            return await execution;
        } finally {
            inFlight.delete(key);
        }
    };
}

/** Exposed for testing — clears all cached entries and in-flight executions. */
export function clearIdempotencyCache(): void {
    cache.clear();
    inFlight.clear();
}

/** Exposed for testing — returns the current number of cached entries. */
export function _cacheSize(): number {
    return cache.size;
}
