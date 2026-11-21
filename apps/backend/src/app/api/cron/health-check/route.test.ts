/**
 * Time-Travel Testing Infrastructure for Cron Job Health Check Route Idempotency (#554)
 *
 * Tests verify that the health check cron route remains idempotent across multiple
 * invocations and handles timing edge cases correctly using fake timers.
 *
 * Run: vitest run src/app/api/cron/health-check/route.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

const CRON_SECRET = 'test-cron-secret';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('@/lib/api/logger', () => ({
  logger: mockLogger,
}));

const mockHealthCheckResults = [
  { deploymentId: 'dep-1', isHealthy: true, responseTime: 245 },
  { deploymentId: 'dep-2', isHealthy: false, responseTime: 5000 },
  { deploymentId: 'dep-3', isHealthy: true, responseTime: 312 },
];

const mockHealthMonitorService = {
  checkAllDeploymentsPaged: vi.fn().mockResolvedValue({
    results: mockHealthCheckResults,
    nextCursor: null,
    totalProcessed: mockHealthCheckResults.length,
  }),
  getCheckpoint: vi.fn().mockResolvedValue(null),
  saveCheckpoint: vi.fn().mockResolvedValue(undefined),
};

const mockVercelService = {
  breaker: { currentState: 'CLOSED' },
};

vi.mock('@/services/health-monitor.service', () => ({
  healthMonitorService: mockHealthMonitorService,
}));

vi.mock('@/services/vercel.service', () => ({
  VercelService: vi.fn(() => mockVercelService),
}));

// ── Test setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Helper functions ──────────────────────────────────────────────────────────

function createCronRequest(secret?: string): NextRequest {
  return new NextRequest('http://localhost:4001/api/cron/health-check', {
    method: 'GET',
    headers: {
      authorization: secret ? `Bearer ${secret}` : `Bearer ${CRON_SECRET}`,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/cron/health-check', () => {
  // ─────────────────────────────────────────────────────────────────────────
  describe('Authentication', () => {
    it('returns 401 for missing authorization header', async () => {
      const request = new NextRequest('http://localhost:4001/api/cron/health-check', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('returns 401 for invalid cron secret', async () => {
      const request = createCronRequest('wrong-secret');
      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('returns 200 for valid cron secret', async () => {
      const request = createCronRequest();
      const response = await GET(request);
      expect(response.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Structured logging', () => {
    it('logs success with job name and counts', async () => {
      const request = createCronRequest();
      await GET(request);

      expect(mockLogger.info).toHaveBeenCalled();
      const [message, fields] = mockLogger.info.mock.calls[0];
      expect(message).toContain('health-check');
      expect(fields).toMatchObject({
        job: 'health-check',
        totalChecked: 3,
        unhealthyCount: 1,
      });
    });

    it('logs failure when health check throws', async () => {
      mockHealthMonitorService.checkAllDeploymentsPaged.mockRejectedValueOnce(
        new Error('boom'),
      );

      const request = createCronRequest();
      const response = await GET(request);

      expect(response.status).toBe(500);
      expect(mockLogger.error).toHaveBeenCalled();
      const [message, fields] = mockLogger.error.mock.calls[0];
      expect(message).toContain('health-check');
      expect(fields).toMatchObject({ job: 'health-check' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Basic health check execution', () => {
    it('calls healthMonitorService.checkAllDeployments', async () => {
      const request = createCronRequest();
      await GET(request);

      expect(mockHealthMonitorService.checkAllDeploymentsPaged).toHaveBeenCalledTimes(1);
    });

    it('returns correct response structure', async () => {
      const request = createCronRequest();
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('totalChecked', 3);
      expect(data).toHaveProperty('unhealthyCount', 1);
      expect(data).toHaveProperty('results');
      expect(data).toHaveProperty('vercelCircuitState');
    });

    it('counts unhealthy deployments correctly', async () => {
      const request = createCronRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.unhealthyCount).toBe(1);
      expect(data.results.filter((r: any) => !r.isHealthy).length).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Idempotency: Multiple invocations', () => {
    it('produces identical results on consecutive invocations', async () => {
      const request1 = createCronRequest();
      const response1 = await GET(request1);
      const data1 = await response1.json();

      const request2 = createCronRequest();
      const response2 = await GET(request2);
      const data2 = await response2.json();

      expect(data1).toEqual(data2);
      expect(mockHealthMonitorService.checkAllDeploymentsPaged).toHaveBeenCalledTimes(2);
    });

    it('does not accumulate state across invocations', async () => {
      // First invocation
      await GET(createCronRequest());
      const firstCallCount = mockHealthMonitorService.checkAllDeploymentsPaged.mock.calls.length;

      // Second invocation
      await GET(createCronRequest());
      const secondCallCount = mockHealthMonitorService.checkAllDeploymentsPaged.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount + 1);
    });

    it('handles rapid successive invocations without side effects', async () => {
      const requests = Array(5).fill(null).map(() => createCronRequest());
      const responses = await Promise.all(requests.map(r => GET(r)));

      expect(responses.every(r => r.status === 200)).toBe(true);
      expect(mockHealthMonitorService.checkAllDeploymentsPaged).toHaveBeenCalledTimes(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Time-travel: Schedule boundary conditions', () => {
    it('executes correctly at exact schedule time', async () => {
      vi.useFakeTimers();
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const request = createCronRequest();
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      vi.useRealTimers();
    });

    it('executes correctly slightly before schedule time', async () => {
      vi.useFakeTimers();
      const scheduleTime = new Date('2024-01-15T10:05:00Z');
      const beforeTime = new Date(scheduleTime.getTime() - 10000); // 10 seconds before

      vi.setSystemTime(beforeTime);
      const request = createCronRequest();
      const response = await GET(request);

      expect(response.status).toBe(200);

      vi.useRealTimers();
    });

    it('executes correctly slightly after schedule time', async () => {
      vi.useFakeTimers();
      const scheduleTime = new Date('2024-01-15T10:05:00Z');
      const afterTime = new Date(scheduleTime.getTime() + 10000); // 10 seconds after

      vi.setSystemTime(afterTime);
      const request = createCronRequest();
      const response = await GET(request);

      expect(response.status).toBe(200);

      vi.useRealTimers();
    });

    it('maintains idempotency across schedule boundaries', async () => {
      vi.useFakeTimers();

      // First execution at 10:00
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      const response1 = await GET(createCronRequest());
      const data1 = await response1.json();

      // Second execution at 10:05 (next schedule)
      vi.setSystemTime(new Date('2024-01-15T10:05:00Z'));
      const response2 = await GET(createCronRequest());
      const data2 = await response2.json();

      // Results should be identical (same health check results)
      expect(data1.totalChecked).toBe(data2.totalChecked);
      expect(data1.unhealthyCount).toBe(data2.unhealthyCount);

      vi.useRealTimers();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Time-travel: Overlapping invocations', () => {
    it('handles overlapping invocations without duplicate side effects', async () => {
      const requests = Array(3).fill(null).map(() => createCronRequest());
      const responses = await Promise.all(requests.map(r => GET(r)));

      expect(responses.every(r => r.status === 200)).toBe(true);
      expect(mockHealthMonitorService.checkAllDeploymentsPaged).toHaveBeenCalledTimes(3);
    });
  });
});
