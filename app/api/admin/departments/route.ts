/**
 * GET /api/admin/departments
 * Liste tous les départements de toutes les organisations (admin).
 * Query: search (optionnel, filtre nom org ou nom dept)
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

        const where =
            search && search.length >= 1
                ? {
                      OR: [
                          { name: { contains: search, mode: 'insensitive' as const } },
                          {
                              organization: {
                                  OR: [
                                      { name: { contains: search, mode: 'insensitive' as const } },
                                      { code: { contains: search, mode: 'insensitive' as const } },
                                  ],
                              },
                          },
                      ],
                  }
                : undefined;

        const departments = await prisma.department.findMany({
            where,
            orderBy: [{ organization: { name: 'asc' } }, { name: 'asc' }],
            include: {
                organization: { select: { id: true, name: true, code: true } },
                head: { select: { id: true, name: true, email: true } },
                _count: { select: { members: true, tasks: true } },
            },
        });

        return NextResponse.json({ departments });
    } catch (error) {
        console.error('Get departments error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}
