import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { apiError, handleApiError } from '@/src/lib/api-response';

export const dynamic = 'force-dynamic';

const editorialTypes = ['ARTICLE', 'POST', 'VIDEO', 'STORY', 'PODCAST', 'NEWSLETTER', 'OTHER'] as const;
const editorialStatuses = ['DRAFT', 'IN_PROGRESS', 'REVIEW', 'PUBLISHED'] as const;

const createItemSchema = z.object({
    title: z.string().min(1, 'Titre requis').max(255),
    description: z.string().max(2000).optional(),
    type: z.enum(editorialTypes).default('POST'),
    status: z.enum(editorialStatuses).default('DRAFT'),
    channel: z.string().max(100).optional(),
    scheduledAt: z.string().datetime().optional().nullable(),
    assigneeId: z.string().optional().nullable(),
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

/** GET: Liste des items du planning éditorial */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string }> }
) {
    try {
        const { id: orgId, collab: collabId, groupId } = await params;
        const result = await ensureGroupMember(request, orgId, collabId, groupId);
        if (result.error) return result.error;

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const month = searchParams.get('month'); // yyyy-MM pour filtrer par mois

        const where: Record<string, unknown> = { groupId };
        if (status && editorialStatuses.includes(status as (typeof editorialStatuses)[number])) {
            where.status = status;
        }
        if (month && month !== 'all') {
            const [y, m] = month.split('-').map(Number);
            if (y && m) {
                const start = new Date(y, m - 1, 1);
                const end = new Date(y, m, 0, 23, 59, 59);
                where.OR = [
                    { scheduledAt: { gte: start, lte: end } },
                    { publishedAt: { gte: start, lte: end } },
                ];
            }
        }

        const items = await prisma.collaborationEditorialItem.findMany({
            where,
            include: {
                creator: { select: { id: true, name: true, email: true } },
                assignee: { select: { id: true, name: true, email: true } },
            },
            orderBy: [{ scheduledAt: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
        });

        return NextResponse.json({ items });
    } catch (error) {
        return handleApiError(error);
    }
}

/** POST: Créer un item du planning éditorial */
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
        const validated = createItemSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const maxOrder = await prisma.collaborationEditorialItem.findMany({
            where: { groupId },
            orderBy: { order: 'desc' },
            take: 1,
            select: { order: true },
        });
        const nextOrder = (maxOrder[0]?.order ?? -1) + 1;

        const item = await prisma.collaborationEditorialItem.create({
            data: {
                groupId,
                title: validated.data.title,
                description: validated.data.description ?? null,
                type: validated.data.type,
                status: validated.data.status,
                channel: validated.data.channel ?? null,
                scheduledAt: validated.data.scheduledAt ? new Date(validated.data.scheduledAt) : null,
                assigneeId: validated.data.assigneeId ?? null,
                order: nextOrder,
                createdBy: userId,
            },
            include: {
                creator: { select: { id: true, name: true, email: true } },
                assignee: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ item }, { status: 201 });
    } catch (error) {
        return handleApiError(error);
    }
}
