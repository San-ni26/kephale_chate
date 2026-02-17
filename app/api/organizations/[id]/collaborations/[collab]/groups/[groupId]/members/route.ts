import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const addMemberSchema = z.object({
    userEmail: z.string().email('Email invalide'),
    memberOrgId: z.string(), // Organisation d'origine du membre (orgA ou orgB)
});

// GET: Liste des membres d'un groupe
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
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                avatarUrl: true,
                                isOnline: true,
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
        });

        if (!group) {
            return NextResponse.json(
                { error: 'Groupe non trouvé' },
                { status: 404 }
            );
        }

        return NextResponse.json({ members: group.members }, { status: 200 });
    } catch (error) {
        console.error('Get collaboration group members error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// POST: Ajouter un membre au groupe (doit être membre de orgA ou orgB)
export async function POST(
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
        const { userEmail, memberOrgId } = addMemberSchema.parse(body);

        const collaboration = await prisma.organizationCollaboration.findFirst({
            where: {
                id: collabId,
                status: 'ACTIVE',
                OR: [{ orgAId: orgId }, { orgBId: orgId }],
            },
        });

        if (!collaboration) {
            return NextResponse.json(
                { error: 'Collaboration non trouvée ou inactive' },
                { status: 404 }
            );
        }

        // Vérifier que memberOrgId est bien orgA ou orgB
        if (memberOrgId !== collaboration.orgAId && memberOrgId !== collaboration.orgBId) {
            return NextResponse.json(
                { error: 'L\'organisation doit être l\'une des deux organisations en collaboration' },
                { status: 400 }
            );
        }

        const group = await prisma.collaborationGroup.findFirst({
            where: {
                id: groupId,
                collaborationId: collabId,
            },
        });

        if (!group) {
            return NextResponse.json(
                { error: 'Groupe non trouvé' },
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
                { error: 'Seuls les propriétaires et administrateurs peuvent ajouter des membres' },
                { status: 403 }
            );
        }

        const userToAdd = await prisma.user.findUnique({
            where: { email: userEmail },
            select: {
                id: true,
                email: true,
                name: true,
            },
        });

        if (!userToAdd) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // Vérifier que l'utilisateur est membre de memberOrgId
        const userOrgMembership = await prisma.organizationMember.findFirst({
            where: {
                userId: userToAdd.id,
                orgId: memberOrgId,
            },
        });

        if (!userOrgMembership) {
            return NextResponse.json(
                { error: 'Cet utilisateur n\'est pas membre de l\'organisation sélectionnée' },
                { status: 400 }
            );
        }

        const existingMember = await prisma.collaborationGroupMember.findFirst({
            where: {
                groupId,
                userId: userToAdd.id,
            },
        });

        if (existingMember) {
            return NextResponse.json(
                { error: 'L\'utilisateur est déjà membre du groupe' },
                { status: 400 }
            );
        }

        const existingMemberWithKey = await prisma.collaborationGroupMember.findFirst({
            where: { groupId },
            select: { encryptedDeptKey: true },
        });
        const encryptedDeptKey = existingMemberWithKey?.encryptedDeptKey ?? group.publicKey;

        await prisma.collaborationGroupMember.create({
            data: {
                groupId,
                userId: userToAdd.id,
                orgId: memberOrgId,
                encryptedDeptKey,
            },
        });

        const conversation = await prisma.group.findFirst({
            where: {
                collaborationGroupId: groupId,
                isDirect: false,
            },
        });

        if (conversation) {
            await prisma.groupMember.create({
                data: {
                    groupId: conversation.id,
                    userId: userToAdd.id,
                },
            });
        }

        return NextResponse.json(
            { message: 'Membre ajouté avec succès' },
            { status: 201 }
        );
    } catch (error) {
        console.error('Add collaboration group member error:', error);

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
