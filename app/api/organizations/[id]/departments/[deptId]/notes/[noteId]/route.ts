import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
import { apiError, handleApiError } from '@/src/lib/api-response';

const updateNoteSchema = z.object({
    title: z.string().min(1, 'Titre requis').max(500).optional(),
    content: z.string().optional(),
    textSize: z.enum(['SMALL', 'NORMAL', 'LARGE']).optional(),
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

/** GET: Détail d'une note (visible par tous les membres) */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; noteId: string }> }
) {
    try {
        const { id: orgId, deptId, noteId } = await params;
        const result = await ensureDeptOrOrgMember(request, orgId, deptId);
        if (result.error) return result.error;

        const note = await prisma.departmentNote.findFirst({
            where: { id: noteId, deptId },
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

/** PATCH: Modifier une note (seul le créateur peut modifier) */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; noteId: string }> }
) {
    try {
        const { id: orgId, deptId, noteId } = await params;
        const result = await ensureDeptOrOrgMember(request, orgId, deptId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const existing = await prisma.departmentNote.findFirst({
            where: { id: noteId, deptId, createdBy: userId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Note non trouvée ou vous n\'êtes pas le créateur. Seul le créateur peut modifier.' }, { status: 403 });
        }

        const body = await request.json();
        const validated = updateNoteSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const updated = await prisma.departmentNote.update({
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

/** DELETE: Supprimer une note (seul le créateur peut supprimer) */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; noteId: string }> }
) {
    try {
        const { id: orgId, deptId, noteId } = await params;
        const result = await ensureDeptOrOrgMember(request, orgId, deptId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const existing = await prisma.departmentNote.findFirst({
            where: { id: noteId, deptId, createdBy: userId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Seul le créateur peut supprimer cette note.' }, { status: 403 });
        }

        await prisma.departmentNote.delete({
            where: { id: noteId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error);
    }
}
