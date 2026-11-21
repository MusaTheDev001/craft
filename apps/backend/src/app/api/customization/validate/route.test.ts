import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import fc from 'fast-check';

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({ auth: { getUser: mockGetUser }, from: vi.fn() }),
}));

const fakeUser = { id: 'user-1', email: 'a@b.com' };

const valid = {
    branding: { appName: 'DEX', primaryColor: '#000', secondaryColor: '#fff', fontFamily: 'Inter' },
    features: { enableCharts: true, enableTransactionHistory: false, enableAnalytics: false, enableNotifications: false },
    stellar: { network: 'testnet', horizonUrl: 'https://horizon-testnet.stellar.org' },
};

const makeRequest = (body: unknown) =>
    new NextRequest('http://localhost/api/customization/validate', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });

const makeDomainRequest = (domain: string) =>
    makeRequest({ ...valid, branding: { ...valid.branding, customDomain: domain } });

const labelArb = fc.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
const tldArb = fc.stringMatching(/^[a-z]{2,24}$/);
const validDomainArb = fc
    .tuple(fc.array(labelArb, { minLength: 1, maxLength: 3 }), tldArb)
    .map(([labels, tld]) => [...labels, tld].join('.'));

const schemeOrPathArb = fc
    .tuple(
        fc.constantFrom('http://', 'https://', 'ftp://', '//', 'www.'),
        validDomainArb,
        fc.constantFrom('/', '/path', '?q=1', '#frag', ':8080', '\\path'),
    )
    .map(([prefix, domain, suffix]) => `${prefix}${domain}${suffix}`);

describe('POST /api/customization/validate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    });

    it('returns 401 when unauthenticated', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
        const { POST } = await import('./route');
        const res = await POST(makeRequest(valid), { params: {} });
        expect(res.status).toBe(401);
    });

    it('returns 200 and valid:true for a correct config', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest(valid), { params: {} });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.valid).toBe(true);
        expect(body.errors).toEqual([]);
    });

    it('returns 422 and field errors for invalid config', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ ...valid, branding: { ...valid.branding, appName: '' } }), { params: {} });
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.valid).toBe(false);
        expect(body.errors[0].field).toBe('branding.appName');
    });

    it('returns 422 for business rule violation', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({
            ...valid,
            stellar: { network: 'mainnet', horizonUrl: 'https://horizon-testnet.stellar.org' },
        }), { params: {} });
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.errors[0].code).toBe('HORIZON_NETWORK_MISMATCH');
    });

    it('returns 400 for invalid JSON', async () => {
        const { POST } = await import('./route');
        const req = new NextRequest('http://localhost/api/customization/validate', {
            method: 'POST',
            body: 'not-json',
            headers: { 'Content-Type': 'application/json' },
        });
        const res = await POST(req, { params: {} });
        expect(res.status).toBe(400);
    });

    it('normalizes custom domains idempotently', async () => {
        const { POST } = await import('./route');
        await fc.assert(
            fc.asyncProperty(validDomainArb, async (domain) => {
                const first = await POST(makeDomainRequest(domain), { params: {} });
                expect(first.status).toBe(200);
                const firstBody = await first.json();
                expect(firstBody.valid).toBe(true);
                const normalized = firstBody.data.branding.customDomain;
                expect(typeof normalized).toBe('string');

                const second = await POST(makeDomainRequest(normalized), { params: {} });
                expect(second.status).toBe(200);
                const secondBody = await second.json();
                expect(secondBody.valid).toBe(true);
                expect(secondBody.data.branding.customDomain).toBe(normalized);
            }),
            { numRuns: 25 },
        );
    });

    it('rejects custom domains containing scheme or path characters', async () => {
        const { POST } = await import('./route');
        await fc.assert(
            fc.asyncProperty(schemeOrPathArb, async (domain) => {
                const res = await POST(makeDomainRequest(domain), { params: {} });
                expect(res.status).toBe(422);
                const body = await res.json();
                expect(body.valid).toBe(false);
                expect(body.errors.some((e: { field: string }) => e.field === 'branding.customDomain')).toBe(true);
            }),
            { numRuns: 25 },
        );
    });
});
