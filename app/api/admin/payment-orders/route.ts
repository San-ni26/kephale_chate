/**
 * API admin - Liste des ordres de paiement
 * GET: Liste tous les ordres (PENDING, APPROVED, REJECTED)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireAdmin } from '@/src/middleware/auth';

export async function GET(request: NextRequest) {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        const where: Record<string, unknown> = {};
        if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            where.status = status;
        }

        const orders = await prisma.paymentOrder.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        const userIds = [...new Set(orders.map((o) => o.userId))];
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, name: true, phone: true },
        });
        const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

        const ordersWithUser = orders.map((o) => ({
            ...o,
            user: userMap[o.userId] || null,
        }));

        return NextResponse.json({ orders: ordersWithUser });
    } catch (error) {
        console.error('Get payment orders error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}
