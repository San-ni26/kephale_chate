
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { subscription } = await request.json();

        if (!subscription || !subscription.endpoint || typeof subscription.endpoint !== 'string') {
            return NextResponse.json({ error: 'Subscription non valide (endpoint manquant)' }, { status: 400 });
        }
        const keys = subscription.keys;
        if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
            return NextResponse.json({ error: 'Subscription non valide (clés p256dh/auth manquantes)' }, { status: 400 });
        }

        // Save subscription
        await prisma.pushSubscription.upsert({
            where: { endpoint: subscription.endpoint },
            update: {
                userId: user.userId,
                p256dh: keys.p256dh,
                auth: keys.auth,
            },
            create: {
                userId: user.userId,
                endpoint: subscription.endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
            }
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }
}
