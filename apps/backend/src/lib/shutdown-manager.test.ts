import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase client module before importing the shutdown manager.
const mockIn = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: mockUpdate,
    })),
  },
}));

import { forceFailStuckDeployments } from './shutdown-manager';

describe('forceFailStuckDeployments', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Build a chainable mock: update(...).eq(...).in(...)
    mockEq.mockReturnValue({ in: mockIn });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockIn.mockResolvedValue({ error: null });
  });

  it('restricts the update to non-terminal (in-progress) statuses', async () => {
    await forceFailStuckDeployments();

    // The update must be scoped by id.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledTimes(1);
    expect(mockEq.mock.calls[0][0]).toBe('id');

    // The update must be further restricted to in-progress statuses so that
    // deployments which reached a terminal state during drain are not
    // overwritten with 'failed'.
    expect(mockIn).toHaveBeenCalledTimes(1);
    const [column, statuses] = mockIn.mock.calls[0];
    expect(column).toBe('status');
    expect(Array.isArray(statuses)).toBe(true);

    // Terminal statuses must never be included in the update filter.
    expect(statuses).not.toContain('deployed');
    expect(statuses).not.toContain('failed');
    expect(statuses).not.toContain('cancelled');

    // The in-progress statuses must be present.
    expect(statuses).toContain('pending');
    expect(statuses).toContain('building');
    expect(statuses).toContain('deploying');
  });

  it('does not overwrite deployments that reached a terminal state', async () => {
    // Simulate a deployment that finished during drain: the conditional
    // update matches zero rows because 'deployed' is not in the status filter.
    mockIn.mockResolvedValue({ error: null, count: 0 });

    await forceFailStuckDeployments();

    const [, statuses] = mockIn.mock.calls[0];
    expect(statuses).not.toContain('deployed');
  });
});