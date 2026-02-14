import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { apiError, handleApiError } from '@/src/lib/api-response';

const updateNoteSchema = z.object({
    title: z.string().min(1, 'Titre requis').max(500).optional(),
    content: z.string().optional(),
    textSize: z.enum(['SMALL', 'NORMAL', 'LARGE']).optional(),
});

async function ensureGroupMember(request: NextRequest, groupId: string) {
    const authError = await authenticate(request);
    if (authError) return { error: authError, userId: null };
    const user = (request as AuthenticatedRequest).user;
    if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }), userId: null };

    const member = await prisma.groupMember.findFirst({
        where: { groupId, userId: user.userId },
    });
    if (!member) {
        return {
            error: NextResponse.json({ error: 'Accès refusé. Vous n\'êtes pas membre de ce groupe.' }, { status: 403 }),
            userId: null,
        };
    }
    return { error: null, userId: user.userId };
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string; docId: string; noteId: string }> }
) {
    try {
        const { groupId, docId, noteId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;

        const document = await prisma.groupDocument.findFirst({
            where: { id: docId, groupId },
        });
        if (!document) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }

        const userId = (request as AuthenticatedRequest).user?.userId;
        const note = await prisma.groupNote.findFirst({
            where: {
                id: noteId,
                documentId: docId,
                OR: [
                    { createdBy: userId },
                    { shares: { some: { sharedWithId: userId } } },
                ],
            },
            include: {
                creator: { select: { id: true, name: true, email: true } },
                shares: {
                    include: { sharedWith: { select: { id: true, name: true, email: true } } },
                },
            },
        });
        if (!note) {
            return NextResponse.json({ error: 'Note non trouvée' }, { status: 404 });
        }

        return NextResponse.json({ note });
    } catch (error) {
        return handleApiError(error);
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string; docId: string; noteId: string }> }
) {
    try {
        const { groupId, docId, noteId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;

        const document = await prisma.groupDocument.findFirst({
            where: { id: docId, groupId },
        });
        if (!document) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }

        const userId = result.userId!;
        const existing = await prisma.groupNote.findFirst({
            where: {
                id: noteId,
                documentId: docId,
                OR: [
                    { createdBy: userId },
                    { shares: { some: { sharedWithId: userId, canEdit: true } } },
                ],
            },
            include: {
                shares: { where: { sharedWithId: userId }, select: { canEdit: true } },
            },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Note non trouvée ou vous n\'avez pas le droit de la modifier.' }, { status: 404 });
        }
        const isCreator = existing.createdBy === userId;
        const sharedWithMe = existing.shares?.[0];
        if (!isCreator && (!sharedWithMe || !sharedWithMe.canEdit)) {
            return NextResponse.json({ error: 'Vous n\'avez pas le droit de modifier cette note (lecture seule).' }, { status: 403 });
        }

        const body = await request.json();
        const validated = updateNoteSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const updated = await prisma.groupNote.update({
            where: { id: noteId },
            data: {
                ...(validated.data.title !== undefined && { title: validated.data.title }),
                ...(validated.data.content !== undefined && { content: validated.data.content }),
                ...(validated.data.textSize !== undefined && { textSize: validated.data.textSize as 'SMALL' | 'NORMAL' | 'LARGE' }),
            },
            include: {
                creator: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ note: updated });
    } catch (error) {
        return handleApiError(error);
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string; docId: string; noteId: string }> }
) {
    try {
        const { groupId, docId, noteId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;

        const document = await prisma.groupDocument.findFirst({
            where: { id: docId, groupId },
        });
        if (!document) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }

        const userId = result.userId!;
        const existing = await prisma.groupNote.findFirst({
            where: { id: noteId, documentId: docId, createdBy: userId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Seul le créateur peut supprimer cette note.' }, { status: 403 });
        }

        await prisma.groupNote.delete({
            where: { id: noteId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error);
    }
}
