import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

const VAPID_SET = Boolean(
    process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
);

/**
 * GET /api/push/status
 * Diagnostic : VAPID configuré + nombre de subscriptions pour l'utilisateur connecté.
 */
export async function GET(request: Request) {
    const authError = await authenticate(request as any);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    let subscriptionCount = 0;
    try {
        subscriptionCount = await prisma.pushSubscription.count({
            where: { userId: user.userId },
        });
    } catch (e) {
        console.error('[Push status] DB error:', e);
    }

    return NextResponse.json({
        vapidConfigured: VAPID_SET,
        subscriptionCount,
        message: !VAPID_SET
            ? 'Le serveur n\'a pas les clés VAPID. Les notifications ne peuvent pas être envoyées.'
            : subscriptionCount === 0
                ? 'Aucun appareil enregistré. Cliquez sur "Activer" pour recevoir les notifications.'
                : undefined,
    });
}
