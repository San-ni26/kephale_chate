import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { apiError, handleApiError } from '@/src/lib/api-response';

const updateDocumentSchema = z.object({
    title: z.string().min(1).max(255).optional(),
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

        let document;
        try {
            document = await prisma.groupDocument.findFirst({
                where: { id: docId, groupId },
                include: {
                    notes: {
                        where: {
                            OR: [
                                { createdBy: userId },
                                { shares: { some: { sharedWithId: userId } } },
                            ],
                        },
                        orderBy: { updatedAt: 'desc' },
                        include: {
                            creator: { select: { id: true, name: true, email: true } },
                            shares: {
                                include: { sharedWith: { select: { id: true, name: true, email: true } } },
                            },
                        },
                    },
                },
            });
        } catch (shareError) {
            console.error('[documents] Share filter failed, falling back to createdBy only:', shareError);
            document = await prisma.groupDocument.findFirst({
                where: { id: docId, groupId },
                include: {
                    notes: {
                        where: { createdBy: userId },
                        orderBy: { updatedAt: 'desc' },
                        include: {
                            creator: { select: { id: true, name: true, email: true } },
                        },
                    },
                },
            });
        }

        if (!document) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }

        return NextResponse.json({ document });
    } catch (error) {
        return handleApiError(error);
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string; docId: string }> }
) {
    try {
        const { groupId, docId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;

        const document = await prisma.groupDocument.findFirst({
            where: { id: docId, groupId },
        });
        if (!document) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }

        const body = await request.json();
        const validated = updateDocumentSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const updated = await prisma.groupDocument.update({
            where: { id: docId },
            data: validated.data,
        });

        return NextResponse.json({ document: updated });
    } catch (error) {
        return handleApiError(error);
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string; docId: string }> }
) {
    try {
        const { groupId, docId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;

        const document = await prisma.groupDocument.findFirst({
            where: { id: docId, groupId },
        });
        if (!document) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }

        await prisma.groupDocument.delete({
            where: { id: docId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error);
    }
}
