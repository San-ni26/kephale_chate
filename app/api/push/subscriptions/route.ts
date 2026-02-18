import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

/**
 * GET /api/push/subscriptions
 * Liste les appareils (push subscriptions) enregistrés pour l'utilisateur connecté.
 */
export async function GET(request: Request) {
    const authError = await authenticate(request as any);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    try {
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId: user.userId },
            select: {
                id: true,
                endpoint: true,
                deviceName: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        const devices = subscriptions.map((sub) => ({
            id: sub.id,
            endpoint: sub.endpoint,
            deviceName: sub.deviceName || null,
            createdAt: sub.createdAt,
        }));

        return NextResponse.json({ devices });
    } catch (e) {
        console.error('[Push subscriptions] DB error:', e);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
