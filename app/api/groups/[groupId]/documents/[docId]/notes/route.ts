import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { apiError, handleApiError } from '@/src/lib/api-response';

const createNoteSchema = z.object({
    title: z.string().min(1, 'Titre requis').max(500),
    content: z.string().default(''),
    textSize: z.enum(['SMALL', 'NORMAL', 'LARGE']).default('NORMAL'),
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
    { params }: { params: Promise<{ groupId: string; docId: string }> }
) {
    try {
        const { groupId, docId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const document = await prisma.groupDocument.findFirst({
            where: { id: docId, groupId },
        });
        if (!document) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }

        let notes;
        try {
            notes = await prisma.groupNote.findMany({
                where: {
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
                orderBy: { updatedAt: 'desc' },
            });
        } catch (shareError) {
            console.error('[notes] Share filter failed, falling back to createdBy only:', shareError);
            notes = await prisma.groupNote.findMany({
                where: { documentId: docId, createdBy: userId },
                include: {
                    creator: { select: { id: true, name: true, email: true } },
                },
                orderBy: { updatedAt: 'desc' },
            });
        }

        return NextResponse.json({ notes });
    } catch (error) {
        return handleApiError(error);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string; docId: string }> }
) {
    try {
        const { groupId, docId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const document = await prisma.groupDocument.findFirst({
            where: { id: docId, groupId },
        });
        if (!document) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }

        const body = await request.json();
        const validated = createNoteSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const maxOrder = await prisma.groupNote.findMany({
            where: { documentId: docId },
            orderBy: { order: 'desc' },
            take: 1,
            select: { order: true },
        });
        const nextOrder = (maxOrder[0]?.order ?? -1) + 1;

        const note = await prisma.groupNote.create({
            data: {
                documentId: docId,
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
