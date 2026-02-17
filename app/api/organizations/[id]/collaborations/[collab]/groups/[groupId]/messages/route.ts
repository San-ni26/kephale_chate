import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
import { emitToConversation } from '@/src/lib/pusher-server';

export const dynamic = 'force-dynamic';

// GET: Messages du groupe de collaboration
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
        }

        const userId = payload.userId;
        const { id: orgId, collab: collabId, groupId } = await params;

        const collabMember = await prisma.collaborationGroupMember.findFirst({
            where: {
                userId,
                groupId,
                group: {
                    collaborationId: collabId,
                    collaboration: {
                        OR: [{ orgAId: orgId }, { orgBId: orgId }],
                    },
                },
            },
        });

        if (!collabMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        let conversation = await prisma.group.findFirst({
            where: {
                collaborationGroupId: groupId,
                isDirect: false,
            },
        });

        if (!conversation) {
            conversation = await prisma.group.create({
                data: {
                    collaborationGroupId: groupId,
                    isDirect: false,
                    name: `Discussion du groupe`,
                },
            });

            const groupMembers = await prisma.collaborationGroupMember.findMany({
                where: { groupId },
                select: { userId: true },
            });

            await prisma.groupMember.createMany({
                data: groupMembers.map((m) => ({
                    groupId: conversation!.id,
                    userId: m.userId,
                })),
                skipDuplicates: true,
            });
        }

        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
        const after = searchParams.get('after');
        const cursor = searchParams.get('cursor');

        const include = {
            sender: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    publicKey: true,
                },
            },
            attachments: {
                select: {
                    id: true,
                    filename: true,
                    type: true,
                    data: true,
                },
            },
        };

        let messagesRaw: Awaited<ReturnType<typeof prisma.message.findMany>>;
        let hasMore = false;

        if (after) {
            messagesRaw = await prisma.message.findMany({
                where: {
                    groupId: conversation.id,
                    createdAt: { gt: new Date(after) },
                },
                include,
                orderBy: { createdAt: 'asc' },
                take: limit,
            });
        } else if (cursor) {
            const cursorMsg = await prisma.message.findUnique({
                where: { id: cursor, groupId: conversation.id },
                select: { createdAt: true },
            });
            if (!cursorMsg) {
                return NextResponse.json({
                    messages: [],
                    hasMore: false,
                    conversationId: conversation.id,
                    pinnedEvents: [],
                });
            }
            messagesRaw = await prisma.message.findMany({
                where: {
                    groupId: conversation.id,
                    createdAt: { lt: cursorMsg.createdAt },
                },
                include,
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
            const olderCount = await prisma.message.count({
                where: {
                    groupId: conversation.id,
                    createdAt: { lt: cursorMsg.createdAt },
                },
            });
            hasMore = olderCount > limit;
            messagesRaw = messagesRaw.reverse();
        } else {
            messagesRaw = await prisma.message.findMany({
                where: { groupId: conversation.id },
                take: limit,
                orderBy: { createdAt: 'desc' },
                include,
            });
            const total = await prisma.message.count({
                where: { groupId: conversation.id },
            });
            hasMore = total > limit;
            messagesRaw = messagesRaw.reverse();
        }

        return NextResponse.json({
            messages: messagesRaw,
            hasMore,
            conversationId: conversation.id,
            pinnedEvents: [],
        });
    } catch (error) {
        console.error('Get collaboration group messages error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// POST: Envoyer un message
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
        }

        const userId = payload.userId;
        const { id: orgId, collab: collabId, groupId } = await params;
        const body = await request.json();
        const { content, attachments } = body;

        const collabMember = await prisma.collaborationGroupMember.findFirst({
            where: {
                userId,
                groupId,
                group: {
                    collaborationId: collabId,
                    collaboration: {
                        OR: [{ orgAId: orgId }, { orgBId: orgId }],
                    },
                },
            },
        });

        if (!collabMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        let conversation = await prisma.group.findFirst({
            where: {
                collaborationGroupId: groupId,
                isDirect: false,
            },
        });

        if (!conversation) {
            conversation = await prisma.group.create({
                data: {
                    collaborationGroupId: groupId,
                    isDirect: false,
                    name: `Discussion du groupe`,
                },
            });

            const groupMembers = await prisma.collaborationGroupMember.findMany({
                where: { groupId },
                select: { userId: true },
            });

            await prisma.groupMember.createMany({
                data: groupMembers.map((m) => ({
                    groupId: conversation!.id,
                    userId: m.userId,
                })),
                skipDuplicates: true,
            });
        }

        const message = await prisma.message.create({
            data: {
                content: content || '',
                senderId: userId,
                groupId: conversation.id,
                attachments: attachments
                    ? {
                          create: attachments.map((att: { filename: string; type: string; data: string }) => ({
                              filename: att.filename,
                              type: att.type,
                              data: att.data,
                          })),
                      }
                    : undefined,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        publicKey: true,
                    },
                },
                attachments: {
                    select: {
                        id: true,
                        filename: true,
                        type: true,
                        data: true,
                    },
                },
            },
        });

        try {
            await emitToConversation(conversation.id, 'message:new', {
                conversationId: conversation.id,
                message,
            });
        } catch (pusherErr) {
            console.error('[Collab messages] Pusher broadcast error:', pusherErr);
        }

        return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
        console.error('Send collaboration group message error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
