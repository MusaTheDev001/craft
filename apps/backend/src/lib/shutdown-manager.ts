/**
 * Tracks in-flight deployment operations and manages graceful drain state.
 *
 * On SIGTERM/SIGINT the drain flag is set.  New deployment requests check
 * isDraining() and respond with 503.  Existing operations call
 * trackOperation() so the process can wait for them to finish before exiting.
 *
 * After the drain timeout, forceFailStuckDeployments() transitions any
 * remaining in-flight deployments to `failed` with reason `shutdown`.
 *
 * Operations are reference-counted: tracking the same id multiple times
 * requires the same number of `done()` calls before it is considered
 * finished.  This prevents a duplicate operation id from prematurely
 * untracking work that is still in flight.
 *
 * Drain timeout: SHUTDOWN_DRAIN_TIMEOUT_MS (default 30 000 ms).
 */

import { createClient } from '@/lib/supabase/server';

const DRAIN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_DRAIN_TIMEOUT_MS ?? '30000', 10);

let draining = false;
const inFlight = new Map<string, number>();

const realtimeCleanups: Array<() => Promise<void>> = [];

export function isDraining(): boolean {
    return draining;
}

/**
 * Register an in-flight operation.  Call the returned `done` callback when
 * the operation finishes (success or failure).
 *
 * Operations are reference-counted by id: each call increments the count
 * for `id`, and the returned `done` callback decrements it.  The id is only
 * removed once its count reaches zero.  `done` is idempotent per call, so
 * invoking it more than once only decrements the count a single time.
 */
export function trackOperation(id: string): () => void {
    inFlight.set(id, (inFlight.get(id) ?? 0) + 1);

    let finished = false;
    return () => {
        if (finished) return;
        finished = true;

        const count = inFlight.get(id);
        if (count === undefined) return;

        if (count <= 1) {
            inFlight.delete(id);
        } else {
            inFlight.set(id, count - 1);
        }
    };
}

export function inFlightCount(): number {
    return inFlight.size;
}

/**
 * Register a cleanup function to be called during shutdown to unsubscribe
 * from Supabase realtime channels.
 */
export function registerRealtimeCleanup(fn: () => Promise<void>): void {
    realtimeCleanups.push(fn);
}

/**
 * Invoke all registered realtime cleanup callbacks.  Each is run and
 * errors are swallowed so one failing unsubscribe does not block the rest.
 */
export async function unsubscribeAll(): Promise<void> {
    await Promise.allSettled(realtimeCleanups.map((fn) => fn()));
    realtimeCleanups.length = 0;
}

/**
 * Deployment statuses that are still in progress (i.e. not terminal).
 * A deployment that reached a terminal state (`completed` or `failed`)
 * during the drain window must not be overwritten.
 */
const IN_PROGRESS_STATUSES = ['pending', 'queued', 'building', 'deploying'] as const;

/**
 * Force-fail any in-flight deployments that did not complete during the
 * drain window.  Each stuck deployment is transitioned to `failed` with
 * `error_message` set to `Shutdown: drain timeout`.
 *
 * The update is restricted to non-terminal statuses so a deployment that
 * finished (e.g. `completed`) between the drain timeout and this update is
 * not overwritten with `failed`.
 */
export async function forceFailStuckDeployments(): Promise<void> {
    if (inFlight.size === 0) return;

    const supabase = createClient();
    const stuck = [...inFlight.keys()];

    await Promise.allSettled(
        stuck.map((id) =>
            supabase
                .from('deployments')
                .update({
                    status: 'failed',
                    error_message: 'Shutdown: drain timeout',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id)
                .in('status', [...IN_PROGRESS_STATUSES]),
        ),
    );

    stuck.forEach((id) => inFlight.delete(id));
}

/**
 * Initiate graceful drain.  Sets the draining flag and waits up to
 * DRAIN_TIMEOUT_MS for in-flight operations to finish before resolving.
 *
 * After the timeout any remaining deployments are force-failed and all
 * realtime channels are unsubscribed.
 */
export async function drain(): Promise<void> {
    draining = true;

    if (inFlight.size === 0) {
        await unsubscribeAll();
        return;
    }

    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    while (inFlight.size > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
    }

    if (inFlight.size > 0) {
        console.warn(
            JSON.stringify({
                level: 'warn',
                message: 'Drain timeout: force-failing stuck deployments',
                inFlight: [...inFlight.keys()],
                timestamp: new Date().toISOString(),
            }),
        );

        await forceFailStuckDeployments();
    }

    await unsubscribeAll();
}

/**
 * Reset internal state for test isolation.
 * Exposed for testing only.
 */
export function _resetState(): void {
    draining = false;
    inFlight.clear();
    realtimeCleanups.length = 0;
}

