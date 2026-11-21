/**
 * CORS configuration for the CRAFT API
 *
 * Allowed-origins strategy:
 *   - Production: read from the ALLOWED_ORIGINS environment variable,
 *     which is a comma-separated list of fully-qualified origins
 *     (e.g. "https://craft.app,https://www.craft.app").
 *   - Development: http://localhost:3000 is always included regardless
 *     of ALLOWED_ORIGINS so local dev works without extra config.
 *
 * Why no wildcard:
 *   Access-Control-Allow-Origin: * would allow any site to make
 *   credentialed cross-origin requests to our API, defeating cookie-
 *   and token-based auth protections.  We only echo back the request
 *   origin when it appears in the allow-list.
 *
 * Adding new origins:
 *   Update the ALLOWED_ORIGINS environment variable — no code change needed.
 *
 * Vary: Origin is unconditional:
 *   Every CORS-aware response carries `Vary: Origin`, even when the
 *   request origin is not in the allow-list.  If the header were only
 *   emitted for allowed origins, a shared cache (CDN, reverse proxy)
 *   could store a response without it and later serve that cached
 *   response to a different origin, poisoning the cache.  Only
 *   Access-Control-Allow-Origin remains conditional on the allow-list.
 *
 * Supported custom request headers:
 *   Content-Type, Authorization, X-Requested-With, API-Version,
 *   Idempotency-Key.  These are listed explicitly (no wildcard) so
 *   preflights for the headers the SDK actually sends succeed.
 *
 * Webhook routes (/api/webhooks/*) are intentionally excluded from this
 * helper.  They use Stripe signature verification for security and must
 * not have permissive CORS headers applied.
 */

const ALWAYS_ALLOWED_DEV = 'http://localhost:3000';

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS =
    'Content-Type, Authorization, X-Requested-With, API-Version, Idempotency-Key';
const MAX_AGE = '86400'; // 24 hours

/**
 * Returns the set of allowed origins from the environment plus localhost in dev.
 */
export function getAllowedOrigins(): Set<string> {
    const origins = new Set<string>();

    const env = process.env.ALLOWED_ORIGINS;
    if (env) {
        for (const o of env.split(',')) {
            const trimmed = o.trim();
            if (trimmed) origins.add(trimmed);
        }
    }

    if (process.env.NODE_ENV !== 'production') {
        origins.add(ALWAYS_ALLOWED_DEV);
    }

    return origins;
}

/**
 * Returns CORS response headers for the given request origin.
 * `Vary: Origin` is always set so shared caches never serve a response
 * across origins; Access-Control-Allow-Origin is omitted when the origin
 * is not in the allow-list.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
    const allowed = getAllowedOrigins();
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Max-Age': MAX_AGE,
        Vary: 'Origin',
    };

    if (origin && allowed.has(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }

    return headers;
}

/**
 * Handles an OPTIONS preflight request.
 * Always returns 204 — the CORS headers are included only when the origin
 * is allowed, so disallowed origins receive a 204 with no ACAO header,
 * which the browser treats as a CORS failure without leaking information.
 */
export function handlePreflight(req: { headers: { get(name: string): string | null } }): Response {
    const origin = req.headers.get('origin');
    return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
    });
}
