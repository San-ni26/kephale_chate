import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
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

async function ensureDeptMember(
    request: NextRequest,
    orgId: string,
    deptId: string
): Promise<{ error: NextResponse | null; userId: string | null }> {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }), userId: null };
    const payload = verifyToken(token);
    if (!payload) return { error: NextResponse.json({ error: 'Token invalide' }, { status: 401 }), userId: null };

    const [deptMember, department, orgMember] = await Promise.all([
        prisma.departmentMember.findFirst({ where: { deptId, userId: payload.userId } }),
        prisma.department.findFirst({ where: { id: deptId }, select: { orgId: true } }),
        prisma.organizationMember.findFirst({ where: { userId: payload.userId, orgId } }),
    ]);

    const canAccess = deptMember || (department && orgMember && department.orgId === orgId);
    if (!canAccess) {
        return {
            error: NextResponse.json({ error: 'Accès refusé. Vous devez être membre du département.' }, { status: 403 }),
            userId: null,
        };
    }
    return { error: null, userId: payload.userId };
}

/** GET: Liste des items du planning éditorial */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const { id: orgId, deptId } = await params;
        const result = await ensureDeptMember(request, orgId, deptId);
        if (result.error) return result.error;

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const month = searchParams.get('month');

        const where: Record<string, unknown> = { deptId };
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

        const items = await prisma.departmentEditorialItem.findMany({
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
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const { id: orgId, deptId } = await params;
        const result = await ensureDeptMember(request, orgId, deptId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const body = await request.json();
        const validated = createItemSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const maxOrder = await prisma.departmentEditorialItem.findMany({
            where: { deptId },
            orderBy: { order: 'desc' },
            take: 1,
            select: { order: true },
        });
        const nextOrder = (maxOrder[0]?.order ?? -1) + 1;

        const item = await prisma.departmentEditorialItem.create({
            data: {
                deptId,
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
