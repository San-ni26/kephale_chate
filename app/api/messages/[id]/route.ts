import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { emitToConversation } from '@/src/lib/pusher-server';
import { decryptUserPII } from '@/src/lib/server-crypto';
import { supabaseAdmin, STORAGE_BUCKET } from '@/src/lib/supabase';


// GET: Récupérer un message complet (avec pièces jointes) par son ID
// Utilisé quand Pusher envoie un payload allégé sans les données des pièces jointes
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

        const message = await prisma.message.findUnique({
            where: { id: params.id },
            include: {
                sender: {
                    select: { id: true, name: true, email: true, publicKey: true },
                },
                attachments: true,
            },
        });

        if (!message) {
            return NextResponse.json({ error: 'Message non trouvé' }, { status: 404 });
        }

        // Vérifier que l'utilisateur est membre de la conversation
        const membership = await prisma.groupMember.findFirst({
            where: { groupId: message.groupId, userId: user.userId },
        });
        if (!membership) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        return NextResponse.json({ message: decryptUserPII(message) }, { status: 200 });

    } catch (error) {
        console.error('Get message error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération du message' },
            { status: 500 }
        );
    }
}

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

        // Update message
        const updatedMessage = await prisma.message.update({
            where: { id: messageId },
            data: {
                content,
                isEdited: true,
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

        // Broadcast edit to conversation channel in real-time
        emitToConversation(message.groupId, 'message:edited', {
            conversationId: message.groupId,
            message: updatedMessage,
        }).catch(err => console.error('Error broadcasting message edit:', err));

        return NextResponse.json({ message: decryptUserPII(updatedMessage) }, { status: 200 });

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

        const groupId = message.groupId;

        // Récupérer les pièces jointes avant suppression pour nettoyer Supabase
        const attachments = await prisma.attachment.findMany({
            where: { messageId: messageId },
            select: { storageKey: true },
        });

        // Supprimer les fichiers Supabase associés
        const storageKeys = attachments
            .map(a => a.storageKey)
            .filter((key): key is string => !!key);

        if (storageKeys.length > 0) {
            const { error: storageError } = await supabaseAdmin.storage
                .from(STORAGE_BUCKET)
                .remove(storageKeys);
            if (storageError) {
                console.error('[Messages] Erreur suppression Supabase:', storageError);
            }
        }

        // Supprimer le message (les attachments sont supprimés en cascade par Prisma)
        await prisma.message.delete({
            where: { id: messageId },
        });

        // Broadcast deletion to conversation channel in real-time
        emitToConversation(groupId, 'message:deleted', {
            conversationId: groupId,
            messageId,
        }).catch(err => console.error('Error broadcasting message delete:', err));

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
