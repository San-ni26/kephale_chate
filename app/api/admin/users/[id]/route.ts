/**
 * GET /api/admin/users/[id] - Détails complets d'un utilisateur
 * DELETE /api/admin/users/[id] - Supprimer un utilisateur (SUPER_ADMIN)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireSuperAdmin } from '@/src/middleware/auth';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireSuperAdmin(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isVerified: true,
                isBanned: true,
                isOnline: true,
                lastSeen: true,
                allowedCountry: true,
                deviceId: true,
                deviceInfo: true,
                location: true,
                currentLocation: true,
                canPublishNotifications: true,
                isFirstLogin: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        sentMessages: true,
                        orgMemberships: true,
                        deptMemberships: true,
                        notifications: true,
                        invitations: true,
                        personalTasks: true,
                        financialGoals: true,
                        publishedAnnouncements: true,
                        createdTasks: true,
                        assignedTasks: true,
                        createdMeetings: true,
                        createdPolls: true,
                        createdDecisions: true,
                        likes: true,
                        comments: true,
                        followers: true,
                        following: true,
                    },
                },
            },
        });

        if (!user) {
            return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
        }

        const orgs = await prisma.organizationMember.findMany({
            where: { userId: id },
            include: {
                organization: {
                    include: {
                        subscription: true,
                        _count: { select: { departments: true } },
                    },
                },
            },
        });

        return NextResponse.json({
            user: {
                ...user,
                organizations: orgs.map((m) => ({
                    org: m.organization,
                    role: m.role,
                })),
            },
        });
    } catch (error) {
        console.error('Get user details error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireSuperAdmin(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const user = await prisma.user.findUnique({
            where: { id },
            select: { id: true, role: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
        }

        if (user.role === 'SUPER_ADMIN') {
            return NextResponse.json(
                { error: 'Impossible de supprimer un super administrateur' },
                { status: 403 }
            );
        }

        await prisma.user.delete({
            where: { id },
        });

        return NextResponse.json({ message: 'Utilisateur supprimé' });
    } catch (error) {
        console.error('Delete user error:', error);
        return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
    }
}
