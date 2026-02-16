import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { handleApiError } from '@/src/lib/api-response';

const updateGroupSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
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

/** PATCH: Renommer un groupe */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;

        const group = await prisma.group.findFirst({
            where: { id: groupId, deptId: null },
        });
        if (!group) {
            return NextResponse.json({ error: 'Groupe non trouvé' }, { status: 404 });
        }

        const body = await request.json();
        const validated = updateGroupSchema.parse(body);

        await prisma.group.update({
            where: { id: groupId },
            data: { name: validated.name },
        });

        return NextResponse.json({ message: 'Groupe renommé' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        return handleApiError(error);
    }
}

/** DELETE: Supprimer un groupe */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;

        const group = await prisma.group.findFirst({
            where: { id: groupId, deptId: null },
        });
        if (!group) {
            return NextResponse.json({ error: 'Groupe non trouvé' }, { status: 404 });
        }

        await prisma.group.delete({
            where: { id: groupId },
        });

        return NextResponse.json({ message: 'Groupe supprimé' });
    } catch (error) {
        return handleApiError(error);
    }
}
