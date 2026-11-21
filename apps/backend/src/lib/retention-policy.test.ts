import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    RETENTION_POLICY,
    RETENTION_WINDOW_RELATIONSHIP,
    getRetentionPolicyWindows,
    normalizeRetentionDays,
    readRetentionDays,
    validateRetentionWindows,
} from './retention-policy';

describe('retention policy', () => {
    it('documents the required ordering relationship across deployment lifecycle jobs', () => {
        expect(RETENTION_POLICY.auditLogCompaction.defaultDays).toBeGreaterThanOrEqual(
            RETENTION_POLICY.tombstonedDeploymentPurge.defaultDays,
        );
        expect(RETENTION_POLICY.analyticsPurge.defaultDays).toBeGreaterThanOrEqual(
            RETENTION_POLICY.tombstonedDeploymentPurge.defaultDays,
        );
        expect(RETENTION_WINDOW_RELATIONSHIP).toContain('auditLogCompactionDays');
        expect(RETENTION_WINDOW_RELATIONSHIP).toContain('analyticsPurgeDays');
    });

    it('accepts the default retention windows for the deployment lifecycle jobs', () => {
        expect(() => validateRetentionWindows(getRetentionPolicyWindows())).not.toThrow();
    });

    it('rejects a config where compaction or analytics retention shrinks below tombstone purge', () => {
        expect(() =>
            validateRetentionWindows({
                auditLogCompactionDays: 29,
                analyticsPurgeDays: 90,
                tombstonedDeploymentPurgeDays: 30,
            })
        ).toThrow(/auditLogCompactionDays.*cannot be shorter/);

        expect(() =>
            validateRetentionWindows({
                auditLogCompactionDays: 90,
                analyticsPurgeDays: 15,
                tombstonedDeploymentPurgeDays: 30,
            })
        ).toThrow(/analyticsPurgeDays.*cannot be shorter/);
    });

    describe('normalizeRetentionDays', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('falls back to the default for 0 and logs a warning naming the env var', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            expect(normalizeRetentionDays(0, 30, 'AUDIT_LOG_COMPACTION_DAYS')).toBe(30);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain('AUDIT_LOG_COMPACTION_DAYS');
        });

        it('falls back to the default for negative values and logs a warning naming the env var', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            expect(normalizeRetentionDays(-1, 30, 'ANALYTICS_PURGE_DAYS')).toBe(30);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain('ANALYTICS_PURGE_DAYS');
        });

        it('falls back to the default for NaN and logs a warning naming the env var', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            expect(normalizeRetentionDays(Number.NaN, 30, 'TOMBSTONED_DEPLOYMENT_PURGE_DAYS')).toBe(30);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain('TOMBSTONED_DEPLOYMENT_PURGE_DAYS');
        });

        it('preserves a valid number without logging a warning', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            expect(normalizeRetentionDays(45, 30, 'AUDIT_LOG_COMPACTION_DAYS')).toBe(45);
            expect(warn).not.toHaveBeenCalled();
        });
    });

    describe('readRetentionDays', () => {
        afterEach(() => {
            vi.unstubAllEnvs();
            vi.restoreAllMocks();
        });

        it('falls back to the default when DEPLOYMENT_TOMBSTONE_RETENTION_DAYS is not a number', () => {
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            vi.stubEnv('DEPLOYMENT_TOMBSTONE_RETENTION_DAYS', 'abc');

            expect(readRetentionDays('DEPLOYMENT_TOMBSTONE_RETENTION_DAYS', 30)).toBe(30);
        });
    });
});
