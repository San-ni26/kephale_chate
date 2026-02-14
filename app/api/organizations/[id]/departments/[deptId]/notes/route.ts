import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
import { apiError, handleApiError } from '@/src/lib/api-response';

const createNoteSchema = z.object({
    title: z.string().min(1, 'Titre requis').max(500),
    content: z.string().default(''),
    textSize: z.enum(['SMALL', 'NORMAL', 'LARGE']).default('NORMAL'),
});

async function ensureDeptOrOrgMember(
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
            error: NextResponse.json({ error: 'Accès refusé. Vous devez être membre du département ou de l\'organisation.' }, { status: 403 }),
            userId: null,
        };
    }
    return { error: null, userId: payload.userId };
}

/** GET: Liste des notes du département (visibles par tous les membres) */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const { id: orgId, deptId } = await params;
        const result = await ensureDeptOrOrgMember(request, orgId, deptId);
        if (result.error) return result.error;

        const department = await prisma.department.findFirst({
            where: { id: deptId },
        });
        if (!department) {
            return NextResponse.json({ error: 'Département non trouvé' }, { status: 404 });
        }

        const notes = await prisma.departmentNote.findMany({
            where: { deptId },
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

/** POST: Créer une note (tout membre du département peut créer) */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const { id: orgId, deptId } = await params;
        const result = await ensureDeptOrOrgMember(request, orgId, deptId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const department = await prisma.department.findFirst({
            where: { id: deptId },
        });
        if (!department) {
            return NextResponse.json({ error: 'Département non trouvé' }, { status: 404 });
        }

        const body = await request.json();
        const validated = createNoteSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const maxOrder = await prisma.departmentNote.findMany({
            where: { deptId },
            orderBy: { order: 'desc' },
            take: 1,
            select: { order: true },
        });
        const nextOrder = (maxOrder[0]?.order ?? -1) + 1;

        const note = await prisma.departmentNote.create({
            data: {
                deptId,
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
