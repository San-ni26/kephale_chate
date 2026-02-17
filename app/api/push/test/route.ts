import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { sendPushNotification } from '@/src/lib/push';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

/**
 * POST /api/push/test
 * Send a test push notification to the current user.
 * Use this to verify push notifications are working.
 */
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
        }

        // Get all push subscriptions for this user
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId: user.userId },
        });

        if (subscriptions.length === 0) {
            return NextResponse.json({
                error: 'Aucune subscription push trouvee pour cet utilisateur',
                hint: 'Sur Safari iOS, vous devez installer la PWA sur votre ecran d\'accueil',
            }, { status: 404 });
        }

        const payload = JSON.stringify({
            title: 'Test Notification',
            body: 'Les notifications fonctionnent! ' + new Date().toLocaleTimeString('fr-FR'),
            icon: '/icons/icon-192x192.png',
            url: '/chat',
            type: 'message',
            data: {
                conversationId: 'test',
            }
        });

        const results = [];
        for (const sub of subscriptions) {
            try {
                await sendPushNotification({
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                }, payload);
                results.push({
                    endpoint: sub.endpoint.substring(0, 50) + '...',
                    status: 'sent',
                });
            } catch (err: any) {
                results.push({
                    endpoint: sub.endpoint.substring(0, 50) + '...',
                    status: 'failed',
                    error: err.statusCode || err.message,
                    needsResubscribe: err.statusCode === 400,
                });
                // Clean up dead subscriptions
                if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 400) {
                    await prisma.pushSubscription.delete({
                        where: { endpoint: sub.endpoint },
                    }).catch(() => {});
                }
            }
        }

        return NextResponse.json({
            message: `Push envoye a ${results.length} subscription(s)`,
            results,
        });
    } catch (error: any) {
        console.error('Test push error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
