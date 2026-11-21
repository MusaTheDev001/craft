import type { Logger } from '../logger';
import { logger as defaultLogger } from '../logger';

export interface UsageRecord {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export interface UsageTracker {
  track(record: UsageRecord): Promise<void>;
}

export interface PendingUsage {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

/**
 * Track a usage record, logging failures through the structured logger.
 */
export async function trackUsage(
  tracker: UsageTracker,
  record: UsageRecord,
  logger: Logger = defaultLogger,
): Promise<void> {
  try {
    await tracker.track(record);
  } catch (error) {
    logger.error('Failed to track usage', {
      userId: record.userId,
      action: record.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Report pending usage records, logging failures through the structured logger.
 */
export async function reportPendingUsage(
  tracker: UsageTracker,
  pending: PendingUsage[],
  logger: Logger = defaultLogger,
): Promise<void> {
  if (pending.length === 0) {
    logger.debug('No pending usage to report');
    return;
  }

  for (const record of pending) {
    try {
      await tracker.track(record);
    } catch (error) {
      logger.warn('Failed to report pending usage', {
        userId: record.userId,
        action: record.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Reported pending usage', { count: pending.length });
}
