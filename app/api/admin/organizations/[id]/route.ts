/**
 * GET /api/admin/organizations/[id] - Détails complets d'une organisation
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireAdmin } from '@/src/middleware/auth';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const org = await prisma.organization.findUnique({
            where: { id },
            include: {
                subscription: true,
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                name: true,
                                phone: true,
                                isOnline: true,
                                lastSeen: true,
                            },
                        },
                    },
                },
                departments: {
                    include: {
                        _count: { select: { members: true, tasks: true } },
                        head: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                },
                events: {
                    select: {
                        id: true,
                        title: true,
                        eventDate: true,
                        maxAttendees: true,
                        token: true,
                    },
                },
                _count: {
                    select: { members: true, departments: true, events: true },
                },
            },
        });

        if (!org) {
            return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });
        }

        const owner = await prisma.user.findUnique({
            where: { id: org.ownerId },
            select: { id: true, email: true, name: true, phone: true, isOnline: true, lastSeen: true },
        });

        return NextResponse.json({
            organization: {
                ...org,
                owner,
            },
        });
    } catch (error) {
        console.error('Get organization error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}
