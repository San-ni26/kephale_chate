import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';

const messageSchema = z.object({
    groupId: z.string(),
    content: z.string().min(1, 'Le message ne peut pas être vide'),
    attachments: z.array(z.object({
        type: z.enum(['IMAGE', 'PDF', 'WORD', 'OTHER']),
        filename: z.string(),
        data: z.string(), // Base64 encoded encrypted data
    })).optional(),
});

// GET: Get messages for a conversation
export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const groupId = searchParams.get('groupId');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        if (!groupId) {
            return NextResponse.json(
                { error: 'ID de conversation requis' },
                { status: 400 }
            );
        }

        // Verify user is member of this group
        const membership = await prisma.groupMember.findFirst({
            where: {
                groupId,
                userId: user.userId,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Vous n\'êtes pas membre de cette conversation' },
                { status: 403 }
            );
        }

        // Get messages
        const messages = await prisma.message.findMany({
            where: { groupId },
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
            orderBy: {
                createdAt: 'desc',
            },
            take: limit,
            skip: offset,
        });

        return NextResponse.json({ messages: messages.reverse() }, { status: 200 });

    } catch (error) {
        console.error('Get messages error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des messages' },
            { status: 500 }
        );
    }
}

// POST: Send a new message
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const validatedData = messageSchema.parse(body);

        // Verify user is member of this group
        const membership = await prisma.groupMember.findFirst({
            where: {
                groupId: validatedData.groupId,
                userId: user.userId,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Vous n\'êtes pas membre de cette conversation' },
                { status: 403 }
            );
        }

        // Create message with attachments
        const message = await prisma.message.create({
            data: {
                content: validatedData.content,
                senderId: user.userId,
                groupId: validatedData.groupId,
                attachments: validatedData.attachments ? {
                    create: validatedData.attachments.map(att => ({
                        type: att.type,
                        filename: att.filename,
                        data: att.data,
                    })),
                } : undefined,
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

        // Update group's updatedAt
        await prisma.group.update({
            where: { id: validatedData.groupId },
            data: { updatedAt: new Date() },
        });

        return NextResponse.json(
            {
                message: 'Message envoyé avec succès',
                data: message,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Send message error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de l\'envoi du message' },
            { status: 500 }
        );
    }
}

// PATCH: Edit a message (within 5 minutes)
export async function PATCH(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const { messageId, content } = body;

        if (!messageId || !content) {
            return NextResponse.json(
                { error: 'ID du message et contenu requis' },
                { status: 400 }
            );
        }

        // Find message
        const message = await prisma.message.findUnique({
            where: { id: messageId },
        });

        if (!message) {
            return NextResponse.json(
                { error: 'Message non trouvé' },
                { status: 404 }
            );
        }

        // Verify user is the sender
        if (message.senderId !== user.userId) {
            return NextResponse.json(
                { error: 'Vous ne pouvez modifier que vos propres messages' },
                { status: 403 }
            );
        }

        // Check if within 5 minutes
        const now = new Date();
        const messageTime = new Date(message.createdAt);
        const diffMinutes = (now.getTime() - messageTime.getTime()) / (1000 * 60);

        if (diffMinutes > 5) {
            return NextResponse.json(
                { error: 'Vous ne pouvez modifier un message que dans les 5 minutes suivant son envoi' },
                { status: 403 }
            );
        }

        // Update message
        const updatedMessage = await prisma.message.update({
            where: { id: messageId },
            data: {
                content,
                updatedAt: new Date(),
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

        return NextResponse.json(
            {
                message: 'Message modifié avec succès',
                data: updatedMessage,
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('Edit message error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la modification du message' },
            { status: 500 }
        );
    }
}

// DELETE: Delete a message
export async function DELETE(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const messageId = searchParams.get('messageId');

        if (!messageId) {
            return NextResponse.json(
                { error: 'ID du message requis' },
                { status: 400 }
            );
        }

        // Find message
        const message = await prisma.message.findUnique({
            where: { id: messageId },
        });

        if (!message) {
            return NextResponse.json(
                { error: 'Message non trouvé' },
                { status: 404 }
            );
        }

        // Verify user is the sender
        if (message.senderId !== user.userId) {
            return NextResponse.json(
                { error: 'Vous ne pouvez supprimer que vos propres messages' },
                { status: 403 }
            );
        }

        // Delete message (attachments will be deleted via cascade)
        await prisma.message.delete({
            where: { id: messageId },
        });

        return NextResponse.json(
            { message: 'Message supprimé avec succès' },
            { status: 200 }
        );

    } catch (error) {
        console.error('Delete message error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la suppression du message' },
            { status: 500 }
        );
    }
}
