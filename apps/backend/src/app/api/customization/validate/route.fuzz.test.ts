/**
 * Customization Config Schema Validation Fuzz Tests
 *
 * Property-based tests using fast-check to generate adversarial JSON payloads
 * and verify the HTTP handler always returns 200 or 400/422, never 500.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({ auth: { getUser: mockGetUser }, from: vi.fn() }),
}));

const fakeUser = { id: 'user-1', email: 'a@b.com' };

const makeRequest = (body: unknown) =>
    new NextRequest('http://localhost/api/customization/validate', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });

// Strkey CRC-16/XMODEM checksum property tests.
// A known valid contract address (C... strkey, 56 chars, base32 alphabet).
const VALID_CONTRACT_ADDRESS =
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Mutate exactly one character of the seed address to a different base32
 * character. Returns the mutated address and the index that changed.
 */
const mutateOneChar = (address: string, index: number, replacement: string) => {
    const chars = address.split('');
    chars[index] = replacement;
    return chars.join('');
};

describe('POST /api/customization/validate - Fuzz Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    });

    it('should never return 500 for any generated JSON value', async () => {
        await fc.assert(
            fc.asyncProperty(fc.jsonValue(), async (payload) => {
                const { POST } = await import('./route');
                const req = makeRequest(payload);
                const res = await POST(req, { params: {} });

                // Response should be 200, 400, 401, 422 or similar — never 500
                expect([200, 400, 401, 422, 500]).toContain(res.status);
                // We want to verify no 500s in particular
                expect(res.status).not.toBe(500);
            }),
            { numRuns: parseInt(process.env.FC_NUM_RUNS ?? '3000') }
        );
    });

    it('should always return a JSON response body', async () => {
        await fc.assert(
            fc.asyncProperty(fc.jsonValue(), async (payload) => {
                const { POST } = await import('./route');
                const req = makeRequest(payload);
                const res = await POST(req, { params: {} });

                if (res.status !== 204) {
                    const body = await res.json().catch(() => null);
                    expect(body).not.toBeNull();
                }
            }),
            { numRuns: 1000 }
        );
    });

    it('should return 400 or 422 for invalid payloads', async () => {
        await fc.assert(
            fc.asyncProperty(fc.jsonValue(), async (payload) => {
                const { POST } = await import('./route');
                const req = makeRequest(payload);
                const res = await POST(req, { params: {} });

                // Valid payloads return 200, invalid ones return 400 or 422
                if (res.status !== 200) {
                    expect([400, 401, 422]).toContain(res.status);
                }
            }),
            { numRuns: 1000 }
        );
    });

    it('should handle missing required fields gracefully', async () => {
        await fc.assert(
            fc.asyncProperty(fc.dictionary(fc.string(), fc.jsonValue()), async (obj) => {
                const { POST } = await import('./route');
                const req = makeRequest(obj);
                const res = await POST(req, { params: {} });

                expect(res.status).not.toBe(500);
                expect([200, 400, 401, 422]).toContain(res.status);
            }),
            { numRuns: 1000 }
        );
    });

    it('should handle extra unknown fields without crashing', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    branding: fc.record({
                        appName: fc.string(),
                        primaryColor: fc.string(),
                        secondaryColor: fc.string(),
                    }),
                    unknownField: fc.string(),
                    anotherUnknown: fc.integer(),
                }),
                async (payload) => {
                    const { POST } = await import('./route');
                    const req = makeRequest(payload);
                    const res = await POST(req, { params: {} });

                    expect(res.status).not.toBe(500);
                }
            ),
            { numRuns: 500 }
        );
    });

    it('should handle wrong field types gracefully', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    branding: fc.oneof(
                        fc.string(),
                        fc.integer(),
                        fc.boolean(),
                        fc.array(fc.string()),
                        fc.constant(null)
                    ),
                    features: fc.oneof(
                        fc.string(),
                        fc.integer(),
                        fc.boolean(),
                        fc.array(fc.string())
                    ),
                }),
                async (payload) => {
                    const { POST } = await import('./route');
                    const req = makeRequest(payload);
                    const res = await POST(req, { params: {} });

                    expect(res.status).not.toBe(500);
                    if (res.status !== 200) {
                        expect([400, 401, 422]).toContain(res.status);
                    }
                }
            ),
            { numRuns: 800 }
        );
    });

    it('should validate response structure when invalid', async () => {
        await fc.assert(
            fc.asyncProperty(fc.jsonValue(), async (payload) => {
                const { POST } = await import('./route');
                const req = makeRequest(payload);
                const res = await POST(req, { params: {} });

                if (res.status === 422 || res.status === 400) {
                    const body = await res.json().catch(() => null);
                    // Should have an 'errors' array on validation failures
                    if (body && res.status === 422) {
                        expect(Array.isArray(body.errors) || body.error).toBeTruthy();
                    }
                }
            }),
            { numRuns: 1000 }
        );
    });

    it('should handle Content-Type spoofing safely', async () => {
        await fc.assert(
            fc.asyncProperty(fc.jsonValue(), async (payload) => {
                const { POST } = await import('./route');
                const req = new NextRequest('http://localhost/api/customization/validate', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                const res = await POST(req, { params: {} });

                // Even with wrong content-type, should not crash
                expect(res.status).not.toBe(500);
            }),
            { numRuns: 500 }
        );
    });

    it('should handle deeply nested objects', async () => {
        const nestedArb = fc.letrec((tie) => ({
            value: fc.oneof(
                fc.string(),
                fc.integer(),
                fc.boolean(),
                fc.constant(null),
                fc.record({
                    nested: tie('value'),
                    data: fc.string(),
                })
            ),
        })).value;

        await fc.assert(
            fc.asyncProperty(nestedArb, async (payload) => {
                const { POST } = await import('./route');
                const req = makeRequest(payload);
                const res = await POST(req, { params: {} });

                expect(res.status).not.toBe(500);
            }),
            { numRuns: 300 }
        );
    });

    it('should reject single-character corruption of a valid contract address (CRC16 checksum)', async () => {
        const { validateContractAddress } = await import(
            '@/lib/contract-validation'
        );

        // Sanity: the seed address must be valid before mutation.
        const seedResult = validateContractAddress(VALID_CONTRACT_ADDRESS);
        expect(seedResult.valid).toBe(true);

        await fc.assert(
            fc.asyncProperty(
                // Pick a character index within the address.
                fc.integer({ min: 0, max: VALID_CONTRACT_ADDRESS.length - 1 }),
                // Pick a replacement base32 character.
                fc.integer({ min: 0, max: BASE32_ALPHABET.length - 1 }),
                async (index, alphabetIndex) => {
                    const original = VALID_CONTRACT_ADDRESS[index];
                    const replacement = BASE32_ALPHABET[alphabetIndex];

                    // Skip no-op mutations (same character).
                    fc.pre(original !== replacement);

                    const mutated = mutateOneChar(
                        VALID_CONTRACT_ADDRESS,
                        index,
                        replacement
                    );

                    const result = validateContractAddress(mutated);

                    // A single-character corruption must never validate.
                    expect(result.valid).toBe(false);
                    if (!result.valid) {
                        expect([
                            'CONTRACT_ADDRESS_INVALID_CHECKSUM',
                            'CONTRACT_ADDRESS_INVALID_VERSION',
                        ]).toContain(result.error);
                    }
                }
            ),
            { numRuns: 50 }
        );
    });

    it('should handle large payloads without timeout', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    data: fc.array(fc.string({ maxLength: 100 }), {
                        maxLength: 1000,
                    }),
                }),
                async (payload) => {
                    const { POST } = await import('./route');
                    const req = makeRequest(payload);
                    const res = await POST(req, { params: {} });

                    expect(res.status).not.toBe(500);
                }
            ),
            { numRuns: 100 }
        );
    });
});
