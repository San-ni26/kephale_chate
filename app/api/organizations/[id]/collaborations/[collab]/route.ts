import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

export const dynamic = 'force-dynamic';

// GET: Détails d'une collaboration
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, collab: collabId } = await params;

        const collaboration = await prisma.organizationCollaboration.findFirst({
            where: {
                id: collabId,
                OR: [{ orgAId: orgId }, { orgBId: orgId }],
            },
            include: {
                orgA: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        logo: true,
                    },
                },
                orgB: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        logo: true,
                    },
                },
                groups: {
                    include: {
                        _count: { select: { members: true } },
                        members: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        email: true,
                                    },
                                },
                                organization: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!collaboration) {
            return NextResponse.json(
                { error: 'Collaboration non trouvée' },
                { status: 404 }
            );
        }

        // Vérifier que l'utilisateur est membre d'une des deux orgs
        const membership = await prisma.organizationMember.findFirst({
            where: {
                userId: user.userId,
                orgId: { in: [collaboration.orgAId, collaboration.orgBId] },
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Accès refusé' },
                { status: 403 }
            );
        }

        const adminMembership = await prisma.organizationMember.findFirst({
            where: {
                userId: user.userId,
                orgId: { in: [collaboration.orgAId, collaboration.orgBId] },
                role: { in: ['OWNER', 'ADMIN'] },
            },
        });
        const canManageGroups = Boolean(adminMembership);

        return NextResponse.json({ collaboration, canManageGroups }, { status: 200 });
    } catch (error) {
        console.error('Get collaboration error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// PATCH: Accepter ou rejeter une collaboration (orgB uniquement)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, collab: collabId } = await params;
        const body = await request.json();
        const { action } = body; // 'accept' | 'reject'

        if (!['accept', 'reject'].includes(action)) {
            return NextResponse.json(
                { error: 'Action invalide. Utilisez "accept" ou "reject"' },
                { status: 400 }
            );
        }

        const collaboration = await prisma.organizationCollaboration.findFirst({
            where: {
                id: collabId,
                orgBId: orgId, // Seule l'org invitée peut accepter/rejeter
            },
        });

        if (!collaboration) {
            return NextResponse.json(
                { error: 'Collaboration non trouvée' },
                { status: 404 }
            );
        }

        if (collaboration.status !== 'PENDING') {
            return NextResponse.json(
                { error: 'Cette invitation a déjà été traitée' },
                { status: 400 }
            );
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_orgId: { userId: user.userId, orgId },
            },
        });

        if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
            return NextResponse.json(
                { error: 'Seuls les propriétaires et administrateurs peuvent accepter/rejeter' },
                { status: 403 }
            );
        }

        await prisma.organizationCollaboration.update({
            where: { id: collabId },
            data: {
                status: action === 'accept' ? 'ACTIVE' : 'REJECTED',
                invitedBy: action === 'accept' ? user.userId : null,
            },
        });

        const updated = await prisma.organizationCollaboration.findUnique({
            where: { id: collabId },
            include: {
                orgA: { select: { id: true, name: true, code: true, logo: true } },
                orgB: { select: { id: true, name: true, code: true, logo: true } },
            },
        });

        return NextResponse.json({
            message: action === 'accept' ? 'Collaboration acceptée' : 'Invitation refusée',
            collaboration: updated,
        });
    } catch (error) {
        console.error('Patch collaboration error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// DELETE: Supprimer une collaboration (admin des deux orgs)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, collab: collabId } = await params;

        const collaboration = await prisma.organizationCollaboration.findFirst({
            where: {
                id: collabId,
                OR: [{ orgAId: orgId }, { orgBId: orgId }],
            },
        });

        if (!collaboration) {
            return NextResponse.json(
                { error: 'Collaboration non trouvée' },
                { status: 404 }
            );
        }

        const membership = await prisma.organizationMember.findFirst({
            where: {
                userId: user.userId,
                orgId,
            },
        });

        if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
            return NextResponse.json(
                { error: 'Accès refusé' },
                { status: 403 }
            );
        }

        await prisma.organizationCollaboration.delete({
            where: { id: collabId },
        });

        return NextResponse.json({ message: 'Collaboration supprimée' });
    } catch (error) {
        console.error('Delete collaboration error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
