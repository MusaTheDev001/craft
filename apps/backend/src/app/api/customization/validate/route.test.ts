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

// Known valid Stellar contract address (Strkey C... with valid CRC16/XMODEM checksum).
const VALID_CONTRACT_ADDRESS = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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

    it('rejects single-character corruption of a valid contract address (CRC16 property)', async () => {
        const { POST } = await import('./route');
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 0, max: VALID_CONTRACT_ADDRESS.length - 1 }),
                fc.integer({ min: 0, max: BASE32_ALPHABET.length - 1 }),
                async (index, alphabetIndex) => {
                    const replacement = BASE32_ALPHABET[alphabetIndex];
                    if (VALID_CONTRACT_ADDRESS[index] === replacement) {
                        return true;
                    }
                    const mutated =
                        VALID_CONTRACT_ADDRESS.slice(0, index) +
                        replacement +
                        VALID_CONTRACT_ADDRESS.slice(index + 1);

                    const res = await POST(
                        makeRequest({
                            ...valid,
                            stellar: { ...valid.stellar, contractAddress: mutated },
                        }),
                        { params: {} },
                    );
                    const body = await res.json();
                    expect(res.status).toBe(422);
                    expect(body.valid).toBe(false);
                    const codes = body.errors.map((e: { code: string }) => e.code);
                    expect(
                        codes.some(
                            (code: string) =>
                                code === 'CONTRACT_ADDRESS_INVALID_CHECKSUM' ||
                                code === 'CONTRACT_ADDRESS_INVALID_VERSION',
                        ),
                    ).toBe(true);
                    return true;
                },
            ),
            { numRuns: 25 },
        );
    });
});
