/**
 * GET /api/admin/organizations
 * Liste des organisations (ADMIN)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireAdmin } from '@/src/middleware/auth';

export async function GET(request: NextRequest) {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search')?.trim();

        const where: { OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; code?: { contains: string; mode: 'insensitive' } }> } = {};
        if (search && search.length >= 2) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }

        const orgs = await prisma.organization.findMany({
            where: where.OR ? where : undefined,
            orderBy: { createdAt: 'desc' },
            include: {
                subscription: true,
                _count: { select: { members: true, departments: true, events: true } },
            },
        });

        const ownerIds = orgs.map((o) => o.ownerId);
        const owners = await prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, email: true, name: true, phone: true },
        });
        const ownerMap = Object.fromEntries(owners.map((u) => [u.id, u]));

        const orgsWithOwner = orgs.map((o) => ({
            ...o,
            owner: ownerMap[o.ownerId] || null,
        }));

        return NextResponse.json({ organizations: orgsWithOwner });
    } catch (error) {
        console.error('Get organizations error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}
