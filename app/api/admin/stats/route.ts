/**
 * GET /api/admin/stats
 * Statistiques du tableau de bord admin (organisations, abonnements, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireAdmin } from '@/src/middleware/auth';

export async function GET(request: NextRequest) {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    try {
        const [totalUsers, totalOrgs, pendingOrders, activeSubscriptions, onlineUsers] = await Promise.all([
            prisma.user.count(),
            prisma.organization.count(),
            prisma.paymentOrder.count({ where: { status: 'PENDING' } }),
            prisma.subscription.count({ where: { isActive: true } }),
            prisma.user.count({ where: { isOnline: true } }),
        ]);

        return NextResponse.json({
            totalUsers,
            totalOrgs,
            pendingOrders,
            activeSubscriptions,
            onlineUsers,
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}
