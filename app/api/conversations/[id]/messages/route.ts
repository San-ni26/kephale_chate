import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { notifyNewMessage } from '@/src/lib/websocket';

// GET: Get messages for a conversation with cursor-based pagination
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
            return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
        }

        const conversationId = params.id;
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);
        const cursor = url.searchParams.get('cursor'); // message ID to paginate before
        const after = url.searchParams.get('after'); // ISO date to get messages after

        // Verify user is a member
        const membership = await prisma.groupMember.findFirst({
            where: {
                groupId: conversationId,
                userId: user.userId,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Acces refuse' },
                { status: 403 }
            );
        }

        const include = {
            sender: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    publicKey: true,
                },
            },
            attachments: true,
        };

        // Case 1: Load messages AFTER a certain date (for polling new messages)
        if (after) {
            const messages = await prisma.message.findMany({
                where: {
                    groupId: conversationId,
                    createdAt: { gt: new Date(after) },
                },
                include,
                orderBy: { createdAt: 'asc' },
                take: limit,
            });

            return NextResponse.json({ messages, hasMore: false });
        }

        // Case 2: Load OLDER messages before a cursor (clicking "load older")
        if (cursor) {
            const cursorMessage = await prisma.message.findUnique({
                where: { id: cursor },
                select: { createdAt: true },
            });

            if (!cursorMessage) {
                return NextResponse.json({ messages: [], hasMore: false });
            }

            const messages = await prisma.message.findMany({
                where: {
                    groupId: conversationId,
                    createdAt: { lt: cursorMessage.createdAt },
                },
                include,
                orderBy: { createdAt: 'desc' },
                take: limit,
            });

            // Reverse to get chronological order
            messages.reverse();

            return NextResponse.json({
                messages,
                hasMore: messages.length === limit,
            });
        }

        // Case 3: Initial load - get the MOST RECENT messages
        // Query in desc order to get the latest, then reverse for display
        const messages = await prisma.message.findMany({
            where: { groupId: conversationId },
            include,
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        // Reverse to chronological order (oldest first for display)
        messages.reverse();

        // Check if there are older messages
        const hasMore = messages.length === limit;

        return NextResponse.json({ messages, hasMore });

    } catch (error) {
        console.error('Get messages error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la recuperation des messages' },
            { status: 500 }
        );
    }
}

// POST: Send a new message
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
        }

        const conversationId = params.id;
        const body = await request.json();
        const { content, attachments } = body;

        if (!content && (!attachments || attachments.length === 0)) {
            return NextResponse.json(
                { error: 'Contenu du message ou fichiers requis' },
                { status: 400 }
            );
        }

        const membership = await prisma.groupMember.findFirst({
            where: {
                groupId: conversationId,
                userId: user.userId,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Acces refuse' },
                { status: 403 }
            );
        }

        let attachmentsData = undefined;
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            const processedAttachments = attachments.map((att: any) => ({
                filename: att.filename,
                type: att.type,
                data: att.data,
            }));
            attachmentsData = { create: processedAttachments };
        }

        const message = await prisma.message.create({
            data: {
                content,
                senderId: user.userId,
                groupId: conversationId,
                attachments: attachmentsData,
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
                attachments: true,
            },
        });

        await prisma.group.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        try {
            await notifyNewMessage(message, conversationId);
        } catch (notifErr) {
            console.error('[Messages API] Notification error:', notifErr);
        }

        return NextResponse.json({ message }, { status: 201 });

    } catch (error) {
        console.error('Send message error:', error);
        return NextResponse.json(
            { error: "Erreur lors de l'envoi du message" },
            { status: 500 }
        );
    }
}
