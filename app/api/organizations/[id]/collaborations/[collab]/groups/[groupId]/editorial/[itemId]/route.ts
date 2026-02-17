import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { apiError, handleApiError } from '@/src/lib/api-response';

export const dynamic = 'force-dynamic';

const editorialTypes = ['ARTICLE', 'POST', 'VIDEO', 'STORY', 'PODCAST', 'NEWSLETTER', 'OTHER'] as const;
const editorialStatuses = ['DRAFT', 'IN_PROGRESS', 'REVIEW', 'PUBLISHED'] as const;

const updateItemSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional().nullable(),
    type: z.enum(editorialTypes).optional(),
    status: z.enum(editorialStatuses).optional(),
    channel: z.string().max(100).optional().nullable(),
    scheduledAt: z.string().datetime().optional().nullable(),
    publishedAt: z.string().datetime().optional().nullable(),
    assigneeId: z.string().optional().nullable(),
    order: z.number().int().optional(),
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
            error: NextResponse.json({ error: 'Accès refusé.' }, { status: 403 }),
            userId: null,
        };
    }
    return { error: null, userId: user.userId };
}

/** GET: Détail d'un item */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string; itemId: string }> }
) {
    try {
        const { id: orgId, collab: collabId, groupId, itemId } = await params;
        const result = await ensureGroupMember(request, orgId, collabId, groupId);
        if (result.error) return result.error;

        const item = await prisma.collaborationEditorialItem.findFirst({
            where: { id: itemId, groupId },
            include: {
                creator: { select: { id: true, name: true, email: true } },
                assignee: { select: { id: true, name: true, email: true } },
            },
        });
        if (!item) return NextResponse.json({ error: 'Item non trouvé' }, { status: 404 });

        return NextResponse.json({ item });
    } catch (error) {
        return handleApiError(error);
    }
}

/** PATCH: Modifier un item */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string; itemId: string }> }
) {
    try {
        const { id: orgId, collab: collabId, groupId, itemId } = await params;
        const result = await ensureGroupMember(request, orgId, collabId, groupId);
        if (result.error) return result.error;

        const existing = await prisma.collaborationEditorialItem.findFirst({
            where: { id: itemId, groupId },
        });
        if (!existing) return NextResponse.json({ error: 'Item non trouvé' }, { status: 404 });

        const body = await request.json();
        const validated = updateItemSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const data: Record<string, unknown> = {};
        if (validated.data.title !== undefined) data.title = validated.data.title;
        if (validated.data.description !== undefined) data.description = validated.data.description;
        if (validated.data.type !== undefined) data.type = validated.data.type;
        if (validated.data.status !== undefined) data.status = validated.data.status;
        if (validated.data.channel !== undefined) data.channel = validated.data.channel;
        if (validated.data.scheduledAt !== undefined) data.scheduledAt = validated.data.scheduledAt ? new Date(validated.data.scheduledAt) : null;
        if (validated.data.publishedAt !== undefined) data.publishedAt = validated.data.publishedAt ? new Date(validated.data.publishedAt) : null;
        if (validated.data.assigneeId !== undefined) data.assigneeId = validated.data.assigneeId;
        if (validated.data.order !== undefined) data.order = validated.data.order;

        const item = await prisma.collaborationEditorialItem.update({
            where: { id: itemId },
            data,
            include: {
                creator: { select: { id: true, name: true, email: true } },
                assignee: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ item });
    } catch (error) {
        return handleApiError(error);
    }
}

/** DELETE: Supprimer un item */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string; itemId: string }> }
) {
    try {
        const { id: orgId, collab: collabId, groupId, itemId } = await params;
        const result = await ensureGroupMember(request, orgId, collabId, groupId);
        if (result.error) return result.error;

        const existing = await prisma.collaborationEditorialItem.findFirst({
            where: { id: itemId, groupId },
        });
        if (!existing) return NextResponse.json({ error: 'Item non trouvé' }, { status: 404 });

        await prisma.collaborationEditorialItem.delete({ where: { id: itemId } });

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error);
    }
}
