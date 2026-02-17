import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { apiError, handleApiError } from '@/src/lib/api-response';

export const dynamic = 'force-dynamic';

const updateNoteSchema = z.object({
    title: z.string().min(1, 'Titre requis').max(500).optional(),
    content: z.string().optional(),
    textSize: z.enum(['SMALL', 'NORMAL', 'LARGE']).optional(),
});

async function ensureGroupMember(
    request: NextRequest,
    orgId: string,
    collabId: string,
    groupId: string
): Promise<{ error: NextResponse | null; userId: string | null }> {
    const authError = await authenticate(request);
    if (authError) return { error: authError, userId: null };

    const user = (request as AuthenticatedRequest).user;
    if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }), userId: null };

    const member = await prisma.collaborationGroupMember.findFirst({
        where: {
            userId: user.userId,
            groupId,
            group: {
                collaborationId: collabId,
                collaboration: { OR: [{ orgAId: orgId }, { orgBId: orgId }] },
            },
        },
    });

    if (!member) {
        return {
            error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }),
            userId: null,
        };
    }
    return { error: null, userId: user.userId };
}

/** GET: Détail d'une note */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string; noteId: string }> }
) {
    try {
        const { id: orgId, collab: collabId, groupId, noteId } = await params;
        const result = await ensureGroupMember(request, orgId, collabId, groupId);
        if (result.error) return result.error;

        const note = await prisma.collaborationNote.findFirst({
            where: { id: noteId, groupId },
            include: {
                creator: { select: { id: true, name: true, email: true } },
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

/** PATCH: Modifier une note */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string; noteId: string }> }
) {
    try {
        const { id: orgId, collab: collabId, groupId, noteId } = await params;
        const result = await ensureGroupMember(request, orgId, collabId, groupId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const existing = await prisma.collaborationNote.findFirst({
            where: { id: noteId, groupId, createdBy: userId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Note non trouvée ou vous n\'êtes pas le créateur.' }, { status: 403 });
        }

        const body = await request.json();
        const validated = updateNoteSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const updated = await prisma.collaborationNote.update({
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

/** DELETE: Supprimer une note */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string; noteId: string }> }
) {
    try {
        const { id: orgId, collab: collabId, groupId, noteId } = await params;
        const result = await ensureGroupMember(request, orgId, collabId, groupId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const existing = await prisma.collaborationNote.findFirst({
            where: { id: noteId, groupId, createdBy: userId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Seul le créateur peut supprimer cette note.' }, { status: 403 });
        }

        await prisma.collaborationNote.delete({ where: { id: noteId } });

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error);
    }
}
