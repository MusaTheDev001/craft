import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withDeploymentAuth } from './with-auth';

// --- Supabase server mock ---
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({
        auth: { getUser: mockGetUser },
        from: mockFrom,
    }),
}));

const makeRequest = () => new NextRequest('http://localhost/api/test');

describe('withAuth', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 when no session exists', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

        const handler = withAuth(async () => NextResponse.json({ ok: true }));
        const res = await handler(makeRequest(), { params: {} });

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when getUser returns an error', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('jwt expired') });

        const handler = withAuth(async () => NextResponse.json({ ok: true }));
        const res = await handler(makeRequest(), { params: {} });

        expect(res.status).toBe(401);
    });

    it('calls the handler with user and supabase when authenticated', async () => {
        const fakeUser = { id: 'user-1', email: 'a@b.com' };
        mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });

        const inner = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
        const handler = withAuth(inner);
        const res = await handler(makeRequest(), { params: {} });

        expect(res.status).toBe(200);
        expect(inner).toHaveBeenCalledOnce();
        expect(inner.mock.calls[0][1].user).toEqual(fakeUser);
        expect(inner.mock.calls[0][1].supabase).toBeDefined();
    });
});

describe('withDeploymentAuth', () => {
    const fakeUser = { id: 'user-1', email: 'a@b.com' };

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    });

    it('returns 404 when deployment not found', async () => {
        mockFrom.mockReturnValue({
            select: () => ({
                eq: () => ({
                    single: () =>
                        Promise.resolve({
                            data: null,
                            error: { code: 'PGRST116', message: 'no rows returned' },
                        }),
                }),
            }),
        });

        const handler = withDeploymentAuth(async () => NextResponse.json({ ok: true }));
        const res = await handler(makeRequest(), { params: { id: 'dep-1' } });

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Not Found' });
    });

    it('returns 404 when deployment belongs to a different user', async () => {
        mockFrom.mockReturnValue({
            select: () => ({
                eq: () => ({
                    single: () => Promise.resolve({ data: { user_id: 'other-user' }, error: null }),
                }),
            }),
        });

        const handler = withDeploymentAuth(async () => NextResponse.json({ ok: true }));
        const res = await handler(makeRequest(), { params: { id: 'dep-1' } });

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Not Found' });
    });

    it('returns 500 when the Supabase query fails with a non-"no rows" error', async () => {
        mockFrom.mockReturnValue({
            select: () => ({
                eq: () => ({
                    single: () =>
                        Promise.resolve({
                            data: null,
                            error: { code: 'XX000', message: 'connection failure' },
                        }),
                }),
            }),
        });

        const handler = withDeploymentAuth(async () => NextResponse.json({ ok: true }));
        const res = await handler(makeRequest(), { params: { id: 'dep-1' } });

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('calls the handler when user owns the deployment', async () => {
        mockFrom.mockReturnValue({
            select: () => ({
                eq: () => ({
                    single: () => Promise.resolve({ data: { user_id: fakeUser.id }, error: null }),
                }),
            }),
        });

        const inner = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
        const handler = withDeploymentAuth(inner);
        const res = await handler(makeRequest(), { params: { id: 'dep-1' } });

        expect(res.status).toBe(200);
        expect(inner).toHaveBeenCalledOnce();
    });

    it('returns 401 when unauthenticated (inherits withAuth behaviour)', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

        const handler = withDeploymentAuth(async () => NextResponse.json({ ok: true }));
        const res = await handler(makeRequest(), { params: { id: 'dep-1' } });

        expect(res.status).toBe(401);
    });
});
