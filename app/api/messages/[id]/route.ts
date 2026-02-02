import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

// PATCH: Edit a message
export async function PATCH(
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

        const messageId = params.id;
        const body = await request.json();
        const { content } = body;

        if (!content) {
            return NextResponse.json(
                { error: 'Contenu requis' },
                { status: 400 }
            );
        }

        // Get message
        const message = await prisma.message.findUnique({
            where: { id: messageId },
        });

        if (!message) {
            return NextResponse.json(
                { error: 'Message non trouvé' },
                { status: 404 }
            );
        }

        // Check ownership
        if (message.senderId !== user.userId) {
            return NextResponse.json(
                { error: 'Vous ne pouvez modifier que vos propres messages' },
                { status: 403 }
            );
        }

        // Check 5-minute window
        const messageTime = new Date(message.createdAt).getTime();
        const now = Date.now();
        if (now - messageTime > 5 * 60 * 1000) {
            return NextResponse.json(
                { error: 'Délai de modification dépassé (5 minutes)' },
                { status: 403 }
            );
        }

        // Update message
        const updatedMessage = await prisma.message.update({
            where: { id: messageId },
            data: {
                content,
                //  isEdited: true,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        return NextResponse.json({ message: updatedMessage }, { status: 200 });

    } catch (error) {
        console.error('Edit message error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la modification du message' },
            { status: 500 }
        );
    }
}

// DELETE: Delete a message
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

        const messageId = params.id;

        // Get message
        const message = await prisma.message.findUnique({
            where: { id: messageId },
        });

        if (!message) {
            return NextResponse.json(
                { error: 'Message non trouvé' },
                { status: 404 }
            );
        }

        // Check ownership
        if (message.senderId !== user.userId) {
            return NextResponse.json(
                { error: 'Vous ne pouvez supprimer que vos propres messages' },
                { status: 403 }
            );
        }

        // Check 5-minute window
        const messageTime = new Date(message.createdAt).getTime();
        const now = Date.now();
        if (now - messageTime > 5 * 60 * 1000) {
            return NextResponse.json(
                { error: 'Délai de suppression dépassé (5 minutes)' },
                { status: 403 }
            );
        }

        // Delete message
        await prisma.message.delete({
            where: { id: messageId },
        });

        return NextResponse.json(
            { message: 'Message supprimé' },
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
