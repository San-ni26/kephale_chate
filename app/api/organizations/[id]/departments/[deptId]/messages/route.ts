import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
import { notifyDepartmentNewMessage } from '@/src/lib/notify-department';
import { emitToConversation } from '@/src/lib/pusher-server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
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
        const { id: orgId, deptId } = await params;

        // Verify user is member of the department
        const deptMember = await prisma.departmentMember.findFirst({
            where: {
                userId,
                deptId,
            },
        });

        if (!deptMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // Get or create the department conversation (Group)
        let conversation = await prisma.group.findFirst({
            where: {
                deptId,
                isDirect: false,
            },
        });

        if (!conversation) {
            // Create conversation for the department
            conversation = await prisma.group.create({
                data: {
                    deptId,
                    isDirect: false,
                    name: `Conversation du département`,
                },
            });

            // Add all department members to the conversation
            const deptMembers = await prisma.departmentMember.findMany({
                where: { deptId },
                select: { userId: true },
            });

            await prisma.groupMember.createMany({
                data: deptMembers.map(m => ({
                    groupId: conversation!.id,
                    userId: m.userId,
                })),
                skipDuplicates: true,
            });
        }

        // Pagination: même logique que /api/conversations/[id]/messages (limit, after, cursor)
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
        const after = searchParams.get('after'); // ISO date – nouveaux messages après
        const cursor = searchParams.get('cursor'); // ID message – messages plus anciens avant

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
                return NextResponse.json({ messages: [], hasMore: false, conversationId: conversation.id, pinnedEvents: [] });
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

        const messages = messagesRaw;

        // Événements épinglés (optionnel : ne pas faire échouer le GET si la table ou la requête échoue)
        let events: Array<Record<string, unknown>> = [];
        try {
            const now = new Date();
            const pinnedEvents = await prisma.eventDepartmentBroadcast.findMany({
                where: {
                    deptId,
                    event: {
                        eventDate: { gte: now },
                    },
                },
                include: {
                    event: {
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            eventType: true,
                            eventDate: true,
                            maxAttendees: true,
                            imageUrl: true,
                            token: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            events = pinnedEvents.map((b) => ({ ...b.event, eventDate: (b.event.eventDate as Date).toISOString() }));
        } catch (pinnedErr) {
            console.warn('Pinned events fetch failed (table may be missing):', pinnedErr);
        }

        return NextResponse.json({
            messages,
            hasMore,
            conversationId: conversation.id,
            pinnedEvents: events,
        });
    } catch (error) {
        console.error('Get department messages error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
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
        const { id: orgId, deptId } = await params;
        const body = await request.json();
        const { content, attachments } = body;

        // Verify user is member of the department
        const deptMember = await prisma.departmentMember.findFirst({
            where: {
                userId,
                deptId,
            },
        });

        if (!deptMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // Get or create the department conversation
        let conversation = await prisma.group.findFirst({
            where: {
                deptId,
                isDirect: false,
            },
        });

        if (!conversation) {
            conversation = await prisma.group.create({
                data: {
                    deptId,
                    isDirect: false,
                    name: `Conversation du département`,
                },
            });

            // Add all department members to the conversation
            const deptMembers = await prisma.departmentMember.findMany({
                where: { deptId },
                select: { userId: true },
            });

            await prisma.groupMember.createMany({
                data: deptMembers.map(m => ({
                    groupId: conversation!.id,
                    userId: m.userId,
                })),
                skipDuplicates: true,
            });
        }

        // Create message
        const message = await prisma.message.create({
            data: {
                content: content || '',
                senderId: userId,
                groupId: conversation.id,
                attachments: attachments
                    ? {
                        create: attachments.map((att: any) => ({
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
            const department = await prisma.department.findUnique({
                where: { id: deptId },
                select: { name: true },
            });
            await notifyDepartmentNewMessage({
                orgId,
                deptId,
                messageId: message.id,
                senderId: userId,
                senderName: message.sender?.name || 'Un membre',
                departmentName: department?.name ?? undefined,
            });
        } catch (notifErr) {
            console.error('[Dept messages] Notify error:', notifErr);
        }

        // Temps réel : même canal que les conversations (presence-conversation-{groupId})
        try {
            await emitToConversation(conversation.id, 'message:new', {
                conversationId: conversation.id,
                message,
            });
        } catch (pusherErr) {
            console.error('[Dept messages] Pusher broadcast error:', pusherErr);
        }

        return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
        console.error('Send department message error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
