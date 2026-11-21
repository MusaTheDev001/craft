import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { f } = vi.hoisted(() => ({ f: vi.fn() }));

vi.mock('stripe', () => ({
  default: vi.fn(() => ({ subscriptions: { update: f } })),
}));
vi.mock('@/lib/api/with-auth', () => ({ withAuth: (h: any) => h }));

import { POST } from './route';

const h = POST as any;
const sb = (p: any) => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolved({ data: p, error: null }),
      })),
    })),
  })),
});

describe('cancel', () => {
  beforeEach(() => f.mockReset());

  it.each([
    ['success', 200, { success: true }, 's', null],
    ['error', 500, { error: 'e' }, 's', 'e'],
    ['nosub', 404, { error: 'No active subscription found' }, null, null],
  ])('%s', async (_t, s, b, sub, e) => {
    if (e) f.mockRejected(new Error(e));
    else f.mockResolved({});
    const r = await h(new NextRequest('http://x'), {
      user: { id: 'u' },
      supabase: sb(sub),
    });
    expect(r.status).toBe(s);
    expect(await r.json()).toEqual(b);
  });

  it('does not leak provider error message on 500', async () => {
    const providerMessage = 'No such subscription: sub_1NxAbCdEfGhIjKlMnOpQrSt';
    f.mockRejected(new Error(providerMessage));

    const r = await h(new NextRequest('http://x'), {
      user: { id: 'u' },
      supabase: sb('s'),
    });

    expect(r.status).toBe(500);
    const body = await r.json();
    expect(body.error).toBe('Failed to cancel subscription');
    expect(body.correlationId).toBeTruthy();
    expect(typeof body.correlationId).toBe('string');
    expect(JSON.stringify(body)).not.toContain(providerMessage);
    expect(JSON.stringify(body)).not.toContain('sub_1NxAbCdEfGhIjKlMnOpQrSt');
  });
});