/**
 * GET /api/admin/performance
 * Métriques système pour le tableau de bord admin : présence, notifications, push, ressources.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireAdmin } from '@/src/middleware/auth';
import { getOnlineUsersCount, isRedisAvailable } from '@/src/lib/presence';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const withDetails = searchParams.get('details') === '1';

    try {
        const redisAvailable = isRedisAvailable();

        const [
            onlineUsersRedis,
            pushSubscriptionsCount,
            pushSubscriptionsByUser,
            notificationsLast24h,
            messagesLast24h,
            notificationsUnread,
        ] = await Promise.all([
            redisAvailable ? getOnlineUsersCount() : Promise.resolve(0),
            prisma.pushSubscription.count(),
            prisma.pushSubscription.groupBy({
                by: ['userId'],
                _count: { id: true },
            }),
            prisma.notification.count({
                where: {
                    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                },
            }),
            prisma.message.count({
                where: {
                    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                },
            }),
            prisma.notification.count({ where: { isRead: false } }),
        ]);

        const pushUsersCount = pushSubscriptionsByUser.length;
        const pushUsersWithMultiple = pushSubscriptionsByUser.filter((g) => g._count.id > 1).length;

        const payload: Record<string, unknown> = {
            onlineUsers: onlineUsersRedis,
            pushSubscriptions: pushSubscriptionsCount,
            pushSubscriptionsUsers: pushUsersCount,
            pushSubscriptionsUsersWithMultiple: pushUsersWithMultiple,
            notificationsLast24h,
            messagesLast24h,
            notificationsUnread,
            redisAvailable,
            timestamp: new Date().toISOString(),
        };

        if (withDetails) {
            const [recentNotifications, recentMessages, pushSample] = await Promise.all([
                prisma.notification.findMany({
                    take: 15,
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        content: true,
                        isRead: true,
                        createdAt: true,
                        user: { select: { email: true, name: true } },
                    },
                }),
                prisma.message.findMany({
                    take: 15,
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        content: true,
                        createdAt: true,
                        sender: { select: { email: true, name: true } },
                    },
                }),
                prisma.pushSubscription.findMany({
                    take: 15,
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        endpoint: true,
                        createdAt: true,
                        user: { select: { email: true, name: true } },
                    },
                }),
            ]);
            payload.details = {
                recentNotifications,
                recentMessages,
                pushSubscriptionsSample: pushSample,
            };
        }

        return NextResponse.json(payload);
    } catch (error) {
        console.error('Admin performance error:', error);
        return NextResponse.json({ error: 'Erreur lors du chargement des métriques' }, { status: 500 });
    }
}
