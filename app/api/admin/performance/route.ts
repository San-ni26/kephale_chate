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

    try {
        const redisAvailable = isRedisAvailable();

        const [
            onlineUsersRedis,
            pushSubscriptionsCount,
            notificationsLast24h,
            messagesLast24h,
            notificationsUnread,
        ] = await Promise.all([
            redisAvailable ? getOnlineUsersCount() : Promise.resolve(0),
            prisma.pushSubscription.count(),
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

        return NextResponse.json({
            onlineUsers: onlineUsersRedis,
            pushSubscriptions: pushSubscriptionsCount,
            notificationsLast24h,
            messagesLast24h,
            notificationsUnread,
            redisAvailable,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Admin performance error:', error);
        return NextResponse.json({ error: 'Erreur lors du chargement des métriques' }, { status: 500 });
    }
}
