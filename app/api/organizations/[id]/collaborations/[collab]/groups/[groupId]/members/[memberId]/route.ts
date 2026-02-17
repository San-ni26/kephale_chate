import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

export const dynamic = 'force-dynamic';

// DELETE: Retirer un membre du groupe (ou quitter si c'est soi-même)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string; memberId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, collab: collabId, groupId, memberId } = await params;

        const member = await prisma.collaborationGroupMember.findFirst({
            where: {
                id: memberId,
                groupId,
                group: {
                    collaborationId: collabId,
                    collaboration: {
                        OR: [{ orgAId: orgId }, { orgBId: orgId }],
                    },
                },
            },
        });

        if (!member) {
            return NextResponse.json(
                { error: 'Membre non trouvé' },
                { status: 404 }
            );
        }

        const isSelf = member.userId === user.userId;
        const membership = await prisma.organizationMember.findFirst({
            where: {
                userId: user.userId,
                orgId,
            },
        });

        if (isSelf) {
            // Quitter le groupe
            await prisma.collaborationGroupMember.delete({
                where: { id: memberId },
            });

            const conversation = await prisma.group.findFirst({
                where: {
                    collaborationGroupId: groupId,
                    isDirect: false,
                },
            });

            if (conversation) {
                await prisma.groupMember.deleteMany({
                    where: {
                        groupId: conversation.id,
                        userId: user.userId,
                    },
                });
            }

            return NextResponse.json({ message: 'Vous avez quitté le groupe' });
        }

        if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
            return NextResponse.json(
                { error: 'Seuls les propriétaires et administrateurs peuvent retirer des membres' },
                { status: 403 }
            );
        }

        await prisma.collaborationGroupMember.delete({
            where: { id: memberId },
        });

        const conversation = await prisma.group.findFirst({
            where: {
                collaborationGroupId: groupId,
                isDirect: false,
            },
        });

        if (conversation) {
            await prisma.groupMember.deleteMany({
                where: {
                    groupId: conversation.id,
                    userId: member.userId,
                },
            });
        }

        return NextResponse.json({ message: 'Membre retiré du groupe' });
    } catch (error) {
        console.error('Remove collaboration group member error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
