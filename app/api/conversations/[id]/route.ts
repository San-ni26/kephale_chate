import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { getOnlineUserIds } from '@/src/lib/presence';
import { getUsersInCall } from '@/src/lib/call-redis';
import { isUserProActive } from '@/src/lib/user-pro';

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const conversationId = params.id;

        // Get conversation with members and pending deletion request (Pro/Pro)
        const conversation = await prisma.group.findUnique({
            where: { id: conversationId },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                publicKey: true,
                                isOnline: true,
                                lastSeen: true,
                            },
                        },
                    },
                },
                department: {
                    select: {
                        id: true,
                        name: true,
                        publicKey: true,
                    },
                },
                deletionRequest: {
                    include: {
                        requester: {
                            select: { id: true, name: true },
                        },
                    },
                },
            },
        });

        if (!conversation) {
            return NextResponse.json(
                { error: 'Conversation non trouvée' },
                { status: 404 }
            );
        }

        // Check if user is a member
        const isMember = conversation.members.some(m => m.userId === user.userId);
        if (!isMember) {
            return NextResponse.json(
                { error: 'Accès refusé' },
                { status: 403 }
            );
        }

        // Merger presence Redis (en ligne) + statut appel (en appel) + currentUserIsPro
        const memberIds = conversation.members.map(m => m.user.id);
        const proSub = await prisma.userProSubscription.findFirst({
            where: { userId: user.userId, isActive: true },
            select: { endDate: true },
        });
        const currentUserIsPro = !!proSub && isUserProActive(proSub.endDate);
        const isLocked = !!conversation.lockCodeHash;
        const lockSetByUserId = conversation.lockSetByUserId ?? null;
        const { lockCodeHash: _omit, ...conversationSafe } = conversation;

        if (conversation.members.length > 0) {
            const [presenceMap, callMap] = await Promise.all([
                getOnlineUserIds(memberIds),
                getUsersInCall(memberIds),
            ]);
            const membersWithPresence = conversation.members.map(m => ({
                ...m,
                user: {
                    ...m.user,
                    isOnline: presenceMap[m.user.id] ?? m.user.isOnline,
                    inCall: !!callMap[m.user.id],
                },
            }));
            return NextResponse.json({
                conversation: {
                    ...conversationSafe,
                    members: membersWithPresence,
                    isLocked,
                    currentUserIsPro,
                    lockSetByUserId,
                },
            }, { status: 200 });
        }

        return NextResponse.json({
            conversation: {
                ...conversationSafe,
                isLocked,
                currentUserIsPro,
                lockSetByUserId,
            },
        }, { status: 200 });

    } catch (error: unknown) {
        console.error('Get conversation error:', error);
        const isTimeout = error instanceof Error && (
            error.message?.includes('ETIMEDOUT') ||
            error.message?.includes('timeout') ||
            (error as { code?: string }).code === 'ETIMEDOUT'
        );
        return NextResponse.json(
            {
                error: isTimeout
                    ? 'Connexion à la base de données expirée. Vérifiez que PostgreSQL est démarré et accessible.'
                    : 'Erreur lors de la récupération de la conversation',
            },
            { status: isTimeout ? 503 : 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const conversationId = params.id;

        const group = await prisma.group.findUnique({
            where: { id: conversationId },
            include: { members: true },
        });

        if (!group) {
            return NextResponse.json(
                { error: 'Conversation non trouvée' },
                { status: 404 }
            );
        }

        const isMember = group.members.some((m) => m.userId === user.userId);
        if (!isMember) {
            return NextResponse.json(
                { error: 'Accès refusé' },
                { status: 403 }
            );
        }

        // Règle Pro : un utilisateur Standard ne peut pas supprimer si l'autre est Pro
        // Pro/Pro : les deux doivent accepter → créer une requête de suppression
        if (group.isDirect && group.members.length === 2) {
            const memberIds = group.members.map(m => m.userId);
            const proSubs = await prisma.userProSubscription.findMany({
                where: { userId: { in: memberIds }, isActive: true },
                select: { userId: true, endDate: true },
            });
            const proUserIds = new Set(
                proSubs.filter(s => isUserProActive(s.endDate)).map(s => s.userId)
            );
            const currentUserIsPro = proUserIds.has(user.userId);
            const otherMember = group.members.find(m => m.userId !== user.userId);
            const otherUserIsPro = otherMember ? proUserIds.has(otherMember.userId) : false;

            if (!currentUserIsPro && otherUserIsPro) {
                return NextResponse.json(
                    { error: 'Seul le membre Pro peut supprimer cette discussion.' },
                    { status: 403 }
                );
            }

            // Pro/Pro : créer une requête de suppression au lieu de supprimer directement
            if (currentUserIsPro && otherUserIsPro) {
                const existingRequest = await prisma.conversationDeletionRequest.findUnique({
                    where: { groupId: conversationId },
                });
                if (existingRequest) {
                    if (existingRequest.requestedBy === user.userId) {
                        return NextResponse.json(
                            { error: 'Vous avez déjà demandé la suppression. En attente de l\'acceptation de l\'autre utilisateur.' },
                            { status: 400 }
                        );
                    }
                    // L'autre a demandé, le current user accepte → on supprimera via accept-deletion
                    return NextResponse.json(
                        { error: 'Utilisez le bouton "Accepter" dans la discussion pour confirmer la suppression.' },
                        { status: 400 }
                    );
                }
                await prisma.conversationDeletionRequest.create({
                    data: {
                        groupId: conversationId,
                        requestedBy: user.userId,
                    },
                });
                return NextResponse.json(
                    { success: true, requestSent: true, message: 'Demande de suppression envoyée. L\'autre utilisateur doit accepter.' },
                    { status: 200 }
                );
            }
        }

        await prisma.group.delete({
            where: { id: conversationId },
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Delete conversation error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la suppression' },
            { status: 500 }
        );
    }
}
