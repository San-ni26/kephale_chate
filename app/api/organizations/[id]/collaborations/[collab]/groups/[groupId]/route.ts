import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateGroupSchema = z.object({
    name: z.string().min(2).optional(),
});

// GET: Détails d'un groupe de collaboration
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, collab: collabId, groupId } = await params;

        const group = await prisma.collaborationGroup.findFirst({
            where: {
                id: groupId,
                collaborationId: collabId,
                collaboration: {
                    OR: [{ orgAId: orgId }, { orgBId: orgId }],
                },
            },
            include: {
                collaboration: {
                    include: {
                        orgA: { select: { id: true, name: true, logo: true } },
                        orgB: { select: { id: true, name: true, logo: true } },
                    },
                },
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                avatarUrl: true,
                                isOnline: true,
                                publicKey: true,
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
                _count: { select: { members: true, tasks: true } },
            },
        });

        if (!group) {
            return NextResponse.json(
                { error: 'Groupe non trouvé' },
                { status: 404 }
            );
        }

        const currentMember = await prisma.collaborationGroupMember.findFirst({
            where: { groupId, userId: user.userId },
            select: { encryptedDeptKey: true },
        });

        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId: user.userId, orgId },
            select: { role: true },
        });
        const isOrgAdmin = orgMember?.role === 'OWNER' || orgMember?.role === 'ADMIN';

        return NextResponse.json({
            group,
            currentMemberEncryptedDeptKey: currentMember?.encryptedDeptKey ?? null,
            canManageMembers: isOrgAdmin,
        }, { status: 200 });
    } catch (error) {
        console.error('Get collaboration group error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// PATCH: Modifier un groupe
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, collab: collabId, groupId } = await params;
        const body = await request.json();
        const validatedData = updateGroupSchema.parse(body);

        const group = await prisma.collaborationGroup.findFirst({
            where: {
                id: groupId,
                collaborationId: collabId,
                collaboration: {
                    OR: [{ orgAId: orgId }, { orgBId: orgId }],
                },
            },
            include: { collaboration: { select: { orgAId: true, orgBId: true } } },
        });

        if (!group) {
            return NextResponse.json(
                { error: 'Groupe non trouvé' },
                { status: 404 }
            );
        }

        const orgIds = [group.collaboration.orgAId, group.collaboration.orgBId];
        const adminMembership = await prisma.organizationMember.findFirst({
            where: {
                userId: user.userId,
                orgId: { in: orgIds },
                role: { in: ['OWNER', 'ADMIN'] },
            },
        });

        if (!adminMembership) {
            return NextResponse.json(
                { error: 'Seuls les administrateurs des deux organisations peuvent modifier un groupe' },
                { status: 403 }
            );
        }

        const updated = await prisma.collaborationGroup.update({
            where: { id: groupId },
            data: validatedData,
        });

        return NextResponse.json({ group: updated });
    } catch (error) {
        console.error('Patch collaboration group error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// DELETE: Supprimer un groupe
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, collab: collabId, groupId } = await params;

        const group = await prisma.collaborationGroup.findFirst({
            where: {
                id: groupId,
                collaborationId: collabId,
                collaboration: {
                    OR: [{ orgAId: orgId }, { orgBId: orgId }],
                },
            },
            include: { collaboration: { select: { orgAId: true, orgBId: true } } },
        });

        if (!group) {
            return NextResponse.json(
                { error: 'Groupe non trouvé' },
                { status: 404 }
            );
        }

        const orgIds = [group.collaboration.orgAId, group.collaboration.orgBId];
        const adminMembership = await prisma.organizationMember.findFirst({
            where: {
                userId: user.userId,
                orgId: { in: orgIds },
                role: { in: ['OWNER', 'ADMIN'] },
            },
        });

        if (!adminMembership) {
            return NextResponse.json(
                { error: 'Seuls les administrateurs des deux organisations peuvent supprimer un groupe' },
                { status: 403 }
            );
        }

        await prisma.collaborationGroup.delete({
            where: { id: groupId },
        });

        return NextResponse.json({ message: 'Groupe supprimé' });
    } catch (error) {
        console.error('Delete collaboration group error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
