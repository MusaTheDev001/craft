import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { withAuth } from '@/lib/api/with-auth';
import { paymentService } from '@/services/payment.service';
import { logger } from '@/lib/logger';

export const POST = withAuth(async (_req: NextRequest, { user, supabase }) => {
    const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_subscription_id')
        .eq('id', user.id)
        .single();

    if (!profile?.stripe_subscription_id) {
        return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    try {
        await paymentService.cancelSubscription(profile.stripe_subscription_id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        const message = error?.message || '';
        // Return a 404 if the subscription is already canceled.
        if (error?.code === 'resource_missing' || /already canceled|cannot cancel/i.test(message)) {
            return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
        }

        const correlationId = randomUUID();
        logger.error('Error canceling subscription', {
            correlationId,
            userId: user.id,
            error: {
                message: error?.message,
                code: error?.code,
                type: error?.type,
                stack: error?.stack,
            },
        });

        return NextResponse.json(
            { error: 'Failed to cancel subscription', correlationId },
            { status: 500 }
        );
    }
});