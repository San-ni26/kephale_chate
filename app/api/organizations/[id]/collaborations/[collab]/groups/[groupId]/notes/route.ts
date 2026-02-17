import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { apiError, handleApiError } from '@/src/lib/api-response';

export const dynamic = 'force-dynamic';

const createNoteSchema = z.object({
    title: z.string().min(1, 'Titre requis').max(500),
    content: z.string().default(''),
    textSize: z.enum(['SMALL', 'NORMAL', 'LARGE']).default('NORMAL'),
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
            error: NextResponse.json({ error: 'Accès refusé. Vous devez être membre du groupe.' }, { status: 403 }),
            userId: null,
        };
    }
    return { error: null, userId: user.userId };
}

/** GET: Liste des notes du groupe */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string }> }
) {
    try {
        const { id: orgId, collab: collabId, groupId } = await params;
        const result = await ensureGroupMember(request, orgId, collabId, groupId);
        if (result.error) return result.error;

        const notes = await prisma.collaborationNote.findMany({
            where: { groupId },
            include: {
                creator: { select: { id: true, name: true, email: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });

        return NextResponse.json({ notes });
    } catch (error) {
        return handleApiError(error);
    }
}

/** POST: Créer une note */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string }> }
) {
    try {
        const { id: orgId, collab: collabId, groupId } = await params;
        const result = await ensureGroupMember(request, orgId, collabId, groupId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const body = await request.json();
        const validated = createNoteSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const maxOrder = await prisma.collaborationNote.findMany({
            where: { groupId },
            orderBy: { order: 'desc' },
            take: 1,
            select: { order: true },
        });
        const nextOrder = (maxOrder[0]?.order ?? -1) + 1;

        const note = await prisma.collaborationNote.create({
            data: {
                groupId,
                title: validated.data.title,
                content: validated.data.content,
                textSize: validated.data.textSize as 'SMALL' | 'NORMAL' | 'LARGE',
                order: nextOrder,
                createdBy: userId,
            },
            include: {
                creator: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ note }, { status: 201 });
    } catch (error) {
        return handleApiError(error);
    }
}
