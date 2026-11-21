import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withUsageTracking } from './with-usage-tracking';

// Mock the trackUsage dependency. Adjust the module path if it differs.
vi.mock('./track-usage', () => ({
  trackUsage: vi.fn(),
}));

import { trackUsage } from './track-usage';

const mockedTrackUsage = vi.mocked(trackUsage);

type TestUser = { id: string; email: string };

const realUser: TestUser = { id: 'user-123', email: 'user@example.com' };

function makeContext(user: TestUser | null = realUser) {
  return {
    user,
    request: new Request('https://example.com/api/test'),
  };
}

describe('withUsageTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the wrapper synchronously (not a Promise)', () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));

    const wrapped = withUsageTracking(handler);

    expect(typeof wrapped).toBe('function');
    expect(wrapped).not.toBeInstanceOf(Promise);
    // A Promise would have a `.then` method; a function should not.
    expect((wrapped as unknown as { then?: unknown }).then).toBeUndefined();
  });

  it('passes the real user from context to the handler', async () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withUsageTracking(handler);

    await wrapped(makeContext(realUser));

    expect(handler).toHaveBeenCalledTimes(1);
    const passedContext = handler.mock.calls[0][0] as { user: TestUser };
    expect(passedContext.user).toEqual(realUser);
    expect(passedContext.user).toBe(realUser);
    // Ensure no empty placeholder object is passed.
    expect(passedContext.user).not.toEqual({});
  });

  it('never passes an empty placeholder user to the handler', async () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withUsageTracking(handler);

    await wrapped(makeContext(realUser));

    const passedContext = handler.mock.calls[0][0] as { user: unknown };
    expect(Object.keys(passedContext.user as object).length).toBeGreaterThan(0);
  });

  it('calls trackUsage after a successful 2xx response', async () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withUsageTracking(handler);

    const response = await wrapped(makeContext(realUser));

    expect(response.status).toBe(200);
    expect(mockedTrackUsage).toHaveBeenCalledTimes(1);
    expect(mockedTrackUsage).toHaveBeenCalledWith(
      expect.objectContaining({ user: realUser }),
    );
  });

  it('calls trackUsage for other 2xx statuses (e.g. 201)', async () => {
    const handler = vi.fn(async () => new Response('created', { status: 201 }));
    const wrapped = withUsageTracking(handler);

    const response = await wrapped(makeContext(realUser));

    expect(response.status).toBe(201);
    expect(mockedTrackUsage).toHaveBeenCalledTimes(1);
  });

  it('does not call trackUsage on a non-2xx response', async () => {
    const handler = vi.fn(async () => new Response('error', { status: 500 }));
    const wrapped = withUsageTracking(handler);

    const response = await wrapped(makeContext(realUser));

    expect(response.status).toBe(500);
    expect(mockedTrackUsage).not.toHaveBeenCalled();
  });

  it('does not call trackUsage when the handler throws', async () => {
    const handler = vi.fn(async () => {
      throw new Error('boom');
    });
    const wrapped = withUsageTracking(handler);

    await expect(wrapped(makeContext(realUser))).rejects.toThrow('boom');
    expect(mockedTrackUsage).not.toHaveBeenCalled();
  });
});