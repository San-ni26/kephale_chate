import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { getOnlineUserIds } from '@/src/lib/presence';

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

        // Get conversation with members
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

        // Merger la presence Redis (en ligne/hors ligne)
        if (conversation.members.length > 0) {
            const memberIds = conversation.members.map(m => m.user.id);
            const presenceMap = await getOnlineUserIds(memberIds);
            const membersWithPresence = conversation.members.map(m => ({
                ...m,
                user: {
                    ...m.user,
                    isOnline: presenceMap[m.user.id] ?? m.user.isOnline,
                },
            }));
            return NextResponse.json({
                conversation: { ...conversation, members: membersWithPresence },
            }, { status: 200 });
        }

        return NextResponse.json({ conversation }, { status: 200 });

    } catch (error) {
        console.error('Get conversation error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération de la conversation' },
            { status: 500 }
        );
    }
}
