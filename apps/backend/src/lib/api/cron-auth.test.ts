import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const SECRET = 'test-cron-secret-123';

// CRON_SECRET is read lazily per request, so no module reload is required.
async function loadWithSecret(secret: string | undefined) {
    if (secret === undefined) vi.stubEnv('CRON_SECRET', '');
    else vi.stubEnv('CRON_SECRET', secret);
    return import('./cron-auth');
}

function makeRequest(authorization?: string): NextRequest {
    const headers = new Headers();
    if (authorization !== undefined) headers.set('authorization', authorization);
    return new NextRequest('http://localhost/api/cron/health-check', { headers });
}

function makeHandler() {
    return vi.fn(async () => NextResponse.json({ status: 'ok' }));
}

describe('withCronAuth', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('invokes the handler when a valid Bearer secret is provided', async () => {
        const { withCronAuth } = await loadWithSecret(SECRET);
        const handler = makeHandler();

        const res = await withCronAuth(handler)(makeRequest(`Bearer ${SECRET}`), { params: {} });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('rejects with 401 when the Authorization header is missing', async () => {
        const { withCronAuth } = await loadWithSecret(SECRET);
        const handler = makeHandler();

        const res = await withCronAuth(handler)(makeRequest(), { params: {} });

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({
            error: 'Unauthorized: invalid or missing cron signature',
        });
        expect(handler).not.toHaveBeenCalled();
    });

    it('rejects with 401 when the secret is wrong', async () => {
        const { withCronAuth } = await loadWithSecret(SECRET);
        const handler = makeHandler();

        const res = await withCronAuth(handler)(makeRequest('Bearer nope'), { params: {} });

        expect(res.status).toBe(401);
        expect(handler).not.toHaveBeenCalled();
    });

    it('rejects an equal-length wrong secret using timingSafeEqual', async () => {
        vi.resetModules();
        const timingSafeEqual = vi.fn((a: Buffer, b: Buffer) => a.equals(b));
        vi.doMock('crypto', async (importOriginal) => {
            const actual = await importOriginal<typeof import('crypto')>();
            return { ...actual, default: actual, timingSafeEqual };
        });
        vi.stubEnv('CRON_SECRET', SECRET);
        const { withCronAuth } = await import('./cron-auth');
        const handler = makeHandler();

        const sameLength = 'x'.repeat(SECRET.length);
        const res = await withCronAuth(handler)(makeRequest(`Bearer ${sameLength}`), { params: {} });

        expect(res.status).toBe(401);
        expect(handler).not.toHaveBeenCalled();
        expect(timingSafeEqual).toHaveBeenCalledTimes(1);

        vi.doUnmock('crypto');
    });

    it('rejects with 401 for a non-Bearer scheme', async () => {
        const { withCronAuth } = await loadWithSecret(SECRET);
        const handler = makeHandler();

        const res = await withCronAuth(handler)(makeRequest(`Basic ${SECRET}`), { params: {} });

        expect(res.status).toBe(401);
        expect(handler).not.toHaveBeenCalled();
    });

    it('rejects with 401 for a Bearer header with no token', async () => {
        const { withCronAuth } = await loadWithSecret(SECRET);
        const handler = makeHandler();

        const res = await withCronAuth(handler)(makeRequest('Bearer'), { params: {} });

        expect(res.status).toBe(401);
        expect(handler).not.toHaveBeenCalled();
    });

    it('rejects with 401 when CRON_SECRET is not configured in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { withCronAuth } = await loadWithSecret(undefined);
        const handler = makeHandler();

        const res = await withCronAuth(handler)(makeRequest(), { params: {} });

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({
            error: 'Unauthorized: invalid or missing cron signature',
        });
        expect(handler).not.toHaveBeenCalled();
    });

    it('allows requests when CRON_SECRET is not configured outside production and warns once', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { withCronAuth } = await loadWithSecret(undefined);
        const handler = makeHandler();

        const res = await withCronAuth(handler)(makeRequest(), { params: {} });

        expect(res.status).toBe(200);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('honours a rotated CRON_SECRET without a module reload', async () => {
        const { validateCronSignature } = await loadWithSecret(SECRET);
        const oldToken = SECRET;
        const newToken = 'rotated-cron-secret-456';

        expect(validateCronSignature(`Bearer ${oldToken}`)).toBe(true);

        vi.stubEnv('CRON_SECRET', newToken);

        expect(validateCronSignature(`Bearer ${oldToken}`)).toBe(false);
        expect(validateCronSignature(`Bearer ${newToken}`)).toBe(true);
    });
});
