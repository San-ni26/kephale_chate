import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { handleApiError } from '@/src/lib/api-response';

/**
 * GET /api/conversations/[id]/shared-notes
 * Notes partagées entre les deux utilisateurs d'une discussion directe.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: conversationId } = await params;

        const conversation = await prisma.group.findUnique({
            where: { id: conversationId },
            include: { members: { include: { user: { select: { id: true } } } } },
        });

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation non trouvée' }, { status: 404 });
        }

        const isMember = conversation.members.some((m) => m.userId === user.userId);
        if (!isMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        if (!conversation.isDirect || conversation.members.length !== 2) {
            return NextResponse.json({ notes: [] });
        }

        const otherMember = conversation.members.find((m) => m.userId !== user.userId);
        const otherUserId = otherMember?.user.id;
        if (!otherUserId) {
            return NextResponse.json({ notes: [] });
        }

        const currentUserId = user.userId;

        const shares = await prisma.groupNoteShare.findMany({
            where: {
                OR: [
                    { sharedWithId: currentUserId, note: { createdBy: otherUserId } },
                    { sharedWithId: otherUserId, note: { createdBy: currentUserId } },
                ],
            },
            include: {
                note: {
                    include: {
                        creator: { select: { id: true, name: true, email: true } },
                        document: {
                            include: {
                                group: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
                sharedWith: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const notes = shares.map((s) => ({
            id: s.note.id,
            title: s.note.title,
            content: s.note.content,
            updatedAt: s.note.updatedAt.toISOString(),
            createdAt: s.note.createdAt.toISOString(),
            createdBy: s.note.createdBy,
            creator: s.note.creator,
            canEdit: s.canEdit,
            sharedWith: s.sharedWith,
            document: s.note.document,
            group: s.note.document.group,
        }));

        return NextResponse.json({ notes });
    } catch (error) {
        return handleApiError(error);
    }
}
