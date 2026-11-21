import { NextRequest, NextResponse } from 'next/server';
import { healthMonitorService } from '@/services/health-monitor.service';
import { VercelService } from '@/services/vercel.service';
import { withCronAuth } from '@/lib/api/cron-auth';
import { logger } from '@/lib/api/logger';

/**
 * Cron endpoint to check health of all deployments
 * This should be called periodically (e.g., every 5 minutes) by a cron service
 *
 * Vercel Cron: https://vercel.com/docs/cron-jobs
 * Configure in vercel.json with crons array containing path and schedule.
 */
// Documented execution time budget for a single cron invocation (ms). If the sweep
// exceeds this, it stops and resumes from the persisted cursor on the next run.
// Override with HEALTH_CHECK_BUDGET_MS (used by tests and by platform-specific configs).
const HEALTH_CHECK_PAGE_SIZE = 50;
const JOB_NAME = 'cron/health-check';

async function handleHealthCheck(req: NextRequest) {
    try {
        logger.info('Running health check for all deployments', {
            job: JOB_NAME,
        });
        const startedAt = Date.now();
        const HEALTH_CHECK_BUDGET_MS = parseInt(
            process.env.HEALTH_CHECK_BUDGET_MS || '60000',
            10
        );

        // Resume from the last persisted cursor so a previously truncated run continues
        // where it left off instead of restarting from the top.
        let cursor: string | null = await healthMonitorService.getCheckpoint();
        let allResults: Array<{
            deploymentId: string;
            isHealthy: boolean;
            responseTime: number;
        }> = [];

        do {
            const page = await healthMonitorService.checkAllDeploymentsPaged({
                cursor,
                limit: HEALTH_CHECK_PAGE_SIZE,
            });
            allResults = allResults.concat(page.results);
            // Persist progress *before* checking the budget, so a run that is killed
            // mid-page by the platform will resume from the last fully completed page.
            cursor = page.nextCursor;
            await healthMonitorService.saveCheckpoint(cursor);

            if (Date.now() - startedAt > HEALTH_CHECK_BUDGET_MS) {
                logger.warn(
                    'Health-check budget exceeded; resuming from cursor on next invocation',
                    {
                        job: JOB_NAME,
                        checkedCount: allResults.length,
                        budgetMs: HEALTH_CHECK_BUDGET_MS,
                    }
                );
                break;
            }
        } while (cursor);

        const unhealthyCount = allResults.filter((r) => !r.isHealthy).length;

        logger.info('Health check complete', {
            job: JOB_NAME,
            totalChecked: allResults.length,
            unhealthyCount,
        });

        return NextResponse.json({
            success: true,
            totalChecked: allResults.length,
            unhealthyCount,
            results: allResults,
            vercelCircuitState: new VercelService().breaker.currentState,
        });
    } catch (error: any) {
        logger.error('Error running health check cron', {
            job: JOB_NAME,
            error: error?.message || String(error),
        });
        return NextResponse.json(
            { error: error.message || 'Health check failed' },
            { status: 500 }
        );
    }
}

export const GET = withCronAuth(handleHealthCheck);
