import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../supabase/server';
import { canConfigureCustomDomain } from '../stripe/pricing';
import {
    withLogging,
    CORRELATION_ID_HEADER,
    type Logger,
} from './logger';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubscriptionTier } from '@craft/types';

export type AuthedRouteContext = {
    user: User;
    supabase: SupabaseClient;
    correlationId: string;
    log: Logger;
};

type RouteHandler<TParams = {}> = (
    req: NextRequest,
    ctx: AuthedRouteContext & { params: TParams }
) => Promise<NextResponse>;

/**
 * Wraps a route handler with Supabase session authentication.
 * Returns 401 if the user is not authenticated.
 * Attaches a correlation ID and logger to the context via withLogging.
 *
 * Compose with withRateLimit / withValidation / withUsageTracking — see
 * CONTRIBUTING.md's "Middleware Composition Order" section for why the
 * nesting order below matters (rate-limit outermost, auth before any
 * role/tier check, usage-tracking innermost).
 *
 * @example
 * ```typescript
 * export const POST = withRateLimit('deployments:create', DEPLOY_RATE_LIMIT)(
 *   withAuth(async (req, { user, params }) => {
 *     const trackedHandler = withUsageTracking(
 *       async (req, ctx) => {
 *         const deployment = await createDeployment(user.id, params);
 *         return NextResponse.json(deployment, { status: 201 });
 *       },
 *       'deployment_create'
 *     );
 *     return trackedHandler(req, { params });
 *   })
 * );
 * ```
 */
export function withAuth<TParams = {}>(handler: RouteHandler<TParams>) {
    return withLogging<TParams>(async (req, { params, correlationId, log }) => {
        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        return handler(req, { user, supabase, correlationId, log, params });
    });
}

/**
 * Wraps a route handler with auth + deployment ownership check.
 *
 * Status mapping:
 * - 401 if the user is unauthenticated (from withAuth).
 * - 404 if the deployment is missing, soft-deleted, or owned by another user.
 *   The response body is identical in all of these cases so that callers
 *   cannot distinguish "does not exist" from "not yours", avoiding leaking
 *   the existence of other users' deployments.
 * - 500 if the Supabase query fails for any reason other than "no rows"
 *   (PGRST116), which is the expected outcome for a missing deployment.
 *
 * Requires `params.id` to be the deployment ID.
 */
export function withDeploymentAuth<TParams extends { id: string }>(
    handler: RouteHandler<TParams>
) {
    return withAuth<TParams>(async (req, ctx) => {
        const { data: deployment, error } = await ctx.supabase
            .from('deployments')
            .select('user_id')
            .eq('id', ctx.params.id)
            .is('deleted_at', null)
            .single();

        if (error && error.code !== 'PGRST116') {
            ctx.log.error('Failed to load deployment for auth check', {
                deploymentId: ctx.params.id,
                error: error.message,
                code: error.code,
            });
            return NextResponse.json(
                { error: 'Internal Server Error' },
                { status: 500 }
            );
        }

        if (!deployment || deployment.user_id !== ctx.user.id) {
            return NextResponse.json(
                { error: 'Deployment not found' },
                { status: 404 }
            );
        }

        return handler(req, ctx);
    });
}

/**
 * Wraps a route handler with auth + deployment ownership + custom-domain tier check.
 * Returns 403 with an upgrade prompt if the user's subscription tier does not
 * include custom domain support (i.e. free tier).
 * Requires `params.id` to be the deployment ID.
 */
export function withDomainTierCheck<TParams extends { id: string }>(
    handler: RouteHandler<TParams>
) {
    return withDeploymentAuth<TParams>(async (req, ctx) => {
        const { data: profile } = await ctx.supabase
            .from('profiles')
            .select('subscription_tier')
            .eq('id', ctx.user.id)
            .single();

        const tier = (profile?.subscription_tier ?? 'free') as SubscriptionTier;

        if (!canConfigureCustomDomain(tier)) {
            return NextResponse.json(
                {
                    error: 'Custom domains require a Pro or Enterprise subscription.',
                    upgradeUrl: '/pricing',
                },
                { status: 403 },
            );
        }

        return handler(req, ctx);
    });
}
