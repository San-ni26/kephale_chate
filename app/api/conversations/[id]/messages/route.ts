import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { notifyNewMessage } from '@/src/lib/websocket';

// GET: Get all messages for a conversation
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

        // Verify user is a member
        const membership = await prisma.groupMember.findFirst({
            where: {
                groupId: conversationId,
                userId: user.userId,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Accès refusé' },
                { status: 403 }
            );
        }

        // Get messages
        const messages = await prisma.message.findMany({
            where: { groupId: conversationId },
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
            orderBy: { createdAt: 'asc' },
        });

        return NextResponse.json({ messages }, { status: 200 });

    } catch (error) {
        console.error('Get messages error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des messages' },
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
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const conversationId = params.id;
        const body = await request.json();
        const { content, attachments } = body;

        // Allow empty content if attachments are present
        if (!content && (!attachments || attachments.length === 0)) {
            return NextResponse.json(
                { error: 'Contenu du message ou fichiers requis' },
                { status: 400 }
            );
        }

        // Verify user is a member
        const membership = await prisma.groupMember.findFirst({
            where: {
                groupId: conversationId,
                userId: user.userId,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Accès refusé' },
                { status: 403 }
            );
        }

        // Prepare attachments if any
        let attachmentsData = undefined;
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            // Store base64 data directly in database (like events system)
            // The data comes as a full data URL (data:image/...;base64,...) from client
            const processedAttachments = attachments.map((att: any) => ({
                filename: att.filename,
                type: att.type,
                data: att.data // Store base64 data URL directly
            }));

            attachmentsData = {
                create: processedAttachments
            };
        }

        // Create message
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

        // Update conversation timestamp
        await prisma.group.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        // Send notifications - await to catch errors in dev
        try {
            await notifyNewMessage(message, conversationId);
            console.log('[Messages API] Notifications sent for message:', message.id);
        } catch (notifErr) {
            console.error('[Messages API] Notification error:', notifErr);
            // Don't fail the message send if notifications fail
        }

        return NextResponse.json({ message }, { status: 201 });

    } catch (error) {
        console.error('Send message error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de l\'envoi du message' },
            { status: 500 }
        );
    }
}