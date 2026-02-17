import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { apiError, handleApiError } from '@/src/lib/api-response';

export const dynamic = 'force-dynamic';

const addDocumentSchema = z.object({
    filename: z.string().min(1).max(255),
    type: z.enum(['IMAGE', 'PDF', 'WORD', 'AUDIO', 'OTHER']),
    data: z.string().min(1),
});

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const { id: orgId, collab: collabId, groupId } = await params;
        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q')?.trim() || '';
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

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
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const documents = await prisma.collaborationDocument.findMany({
            where: {
                groupId,
                ...(q ? { filename: { contains: q, mode: 'insensitive' as const } } : {}),
            },
            take: limit,
            skip: offset,
            include: {
                uploader: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ documents });
    } catch (error) {
        return handleApiError(error);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const { id: orgId, collab: collabId, groupId } = await params;
        const body = await request.json();
        const validated = addDocumentSchema.safeParse(body);

        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

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
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const { filename, type, data } = validated.data;

        const doc = await prisma.collaborationDocument.create({
            data: { groupId, filename, type, data, uploadedBy: user.userId },
            include: {
                uploader: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ document: doc }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return apiError('Données invalides', 400, { details: error.issues });
        }
        return handleApiError(error);
    }
}
