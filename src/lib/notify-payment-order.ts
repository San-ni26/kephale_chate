/**
 * Notifie le(s) super admin(s) à chaque création d'ordre de paiement
 * (création d'organisation ou upgrade d'abonnement en mode manuel).
 *
 * - Notification en base (visible à l'ouverture de l'app)
 * - Pusher (toast en temps réel si l'app est ouverte)
 * - Web Push (notification système même quand l'app est fermée)
 */

import { prisma } from '@/src/lib/prisma';
import { emitToUser } from '@/src/lib/pusher-server';
import { sendPushNotification } from '@/src/lib/push';

export type PaymentOrderType = 'CREATE' | 'UPGRADE' | 'USER_PRO';

export interface NotifyPaymentOrderParams {
    orderId: string;
    plan: string;
    name: string;
    amountFcfa: number;
    type: PaymentOrderType;
}

/**
 * Crée une notification en base, envoie Pusher et Web Push aux utilisateurs SUPER_ADMIN.
 * La Web Push permet de notifier même quand l'app (navigateur) est fermée.
 */
export async function notifySuperAdminNewPaymentOrder(params: NotifyPaymentOrderParams): Promise<void> {
    const { orderId, plan, name, amountFcfa, type } = params;

    try {
        const superAdmins = await prisma.user.findMany({
            where: { role: 'SUPER_ADMIN' },
            select: { id: true },
        });

        if (superAdmins.length === 0) {
            return;
        }

        const typeLabel = type === 'UPGRADE' ? 'Mise à niveau d\'abonnement' : type === 'USER_PRO' ? 'Compte Pro' : 'Nouvelle organisation';
        const content = `${typeLabel} : ordre de paiement en attente — ${name} — Plan ${plan} — ${amountFcfa.toLocaleString('fr-FR')} FCFA`;

        for (const admin of superAdmins) {
            try {
                const notification = await prisma.notification.create({
                    data: {
                        userId: admin.id,
                        content,
                        isRead: false,
                    },
                });

                // Pusher : toast en temps réel si l'app est ouverte
                try {
                    await emitToUser(admin.id, 'notification:new', {
                        id: notification.id,
                        content,
                        type: 'payment_order',
                        paymentOrderId: orderId,
                        plan,
                        name,
                        amountFcfa,
                        createdAt: notification.createdAt,
                    });
                } catch (pusherErr) {
                    console.error('[NotifyPaymentOrder] Pusher emit error for super admin:', admin.id, pusherErr);
                }

                // Web Push : notification système même quand l'app est fermée
                try {
                    const subscriptions = await prisma.pushSubscription.findMany({
                        where: { userId: admin.id },
                    });
                    if (subscriptions.length > 0) {
                        const payload = {
                            title: typeLabel,
                            body: `${name} — Plan ${plan} — ${amountFcfa.toLocaleString('fr-FR')} FCFA`,
                            icon: '/icons/icon-192x192.png',
                            url: '/admin',
                            type: 'payment_order',
                            data: { paymentOrderId: orderId, plan, name, amountFcfa },
                        };
                        await Promise.allSettled(
                            subscriptions.map(async (sub) => {
                                try {
                                    await sendPushNotification(
                                        {
                                            endpoint: sub.endpoint,
                                            keys: { p256dh: sub.p256dh, auth: sub.auth },
                                        },
                                        payload
                                    );
                                } catch (err: any) {
                                    if (err?.statusCode === 410 || err?.statusCode === 404) {
                                        await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
                                    }
                                    throw err;
                                }
                            })
                        );
                    }
                } catch (pushErr) {
                    console.error('[NotifyPaymentOrder] Web Push error for super admin:', admin.id, pushErr);
                }
            } catch (dbErr) {
                console.error('[NotifyPaymentOrder] Failed to create notification for super admin:', admin.id, dbErr);
            }
        }
    } catch (err) {
        console.error('[NotifyPaymentOrder] Error notifying super admins:', err);
    }
}
