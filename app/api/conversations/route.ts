import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { getOnlineUserIds } from '@/src/lib/presence';
import { getUsersInCall } from '@/src/lib/call-redis';

// GET: Get all conversations for the authenticated user
export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        // Get all groups where user is a member, with unread counts
        const conversations = await prisma.group.findMany({
            where: {
                members: {
                    some: {
                        userId: user.userId,
                    },
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
                                publicKey: true,
                                isOnline: true,
                                lastSeen: true,
                            },
                        },
                    },
                },
                messages: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 1,
                    include: {
                        sender: {
                            select: {
                                id: true,
                                name: true,
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
            orderBy: {
                updatedAt: 'desc',
            },
        });

        // Calculate unread counts and merge Redis presence + statut appel
        const memberUserIds = [...new Set(conversations.flatMap(c => c.members.map(m => m.user.id)))];
        const [presenceMap, callMap] = await Promise.all([
            getOnlineUserIds(memberUserIds),
            getUsersInCall(memberUserIds),
        ]);

        const conversationsWithUnread = await Promise.all(
            conversations.map(async (conv) => {
                const membership = conv.members.find(m => m.userId === user.userId);
                const lastReadAt = membership?.lastReadAt || membership?.joinedAt || new Date(0);

                const unreadCount = await prisma.message.count({
                    where: {
                        groupId: conv.id,
                        createdAt: { gt: lastReadAt },
                        senderId: { not: user.userId },
                    },
                });

                // Merge Redis presence + statut appel
                const membersWithPresence = conv.members.map(m => ({
                    ...m,
                    user: {
                        ...m.user,
                        isOnline: presenceMap[m.user.id] ?? m.user.isOnline,
                        inCall: !!callMap[m.user.id],
                    },
                }));

                return {
                    ...conv,
                    members: membersWithPresence,
                    unreadCount,
                };
            })
        );

        return NextResponse.json({ conversations: conversationsWithUnread }, { status: 200 });

    } catch (error) {
        console.error('Get conversations error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des conversations' },
            { status: 500 }
        );
    }
}

// POST: Create a new direct conversation
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const { otherUserEmail, participantId } = body;

        if (!otherUserEmail && !participantId) {
            return NextResponse.json(
                { error: 'Email ou ID de l\'autre utilisateur requis' },
                { status: 400 }
            );
        }

        // Find the other user by ID or email
        let otherUser;
        if (participantId) {
            otherUser = await prisma.user.findUnique({
                where: { id: participantId },
            });
        } else {
            otherUser = await prisma.user.findUnique({
                where: { email: otherUserEmail },
            });
        }

        if (!otherUser) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        if (otherUser.id === user.userId) {
            return NextResponse.json(
                { error: 'Vous ne pouvez pas créer une conversation avec vous-même' },
                { status: 400 }
            );
        }

        // Check if conversation already exists
        const existingConversation = await prisma.group.findFirst({
            where: {
                isDirect: true,
                members: {
                    every: {
                        OR: [
                            { userId: user.userId },
                            { userId: otherUser.id },
                        ],
                    },
                },
            },
            include: {
                members: true,
            },
        });

        // Verify it's a 2-person conversation
        if (existingConversation && existingConversation.members.length === 2) {
            const memberIds = existingConversation.members.map((m: any) => m.userId);
            if (memberIds.includes(user.userId) && memberIds.includes(otherUser.id)) {
                return NextResponse.json(
                    {
                        message: 'Conversation déjà existante',
                        conversationId: existingConversation.id,
                    },
                    { status: 200 }
                );
            }
        }

        // Create new direct conversation
        const conversation = await prisma.group.create({
            data: {
                isDirect: true,
                members: {
                    create: [
                        { userId: user.userId },
                        { userId: otherUser.id },
                    ],
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
                                publicKey: true,
                                isOnline: true,
                                lastSeen: true,
                            },
                        },
                    },
                },
            },
        });

        return NextResponse.json(
            {
                message: 'Conversation créée avec succès',
                conversation,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Create conversation error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la création de la conversation' },
            { status: 500 }
        );
    }
}
