import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';

const bodySchema = z.object({
    target: z.enum(['all', 'selected']),
    departmentIds: z.array(z.string()).optional(),
});

/**
 * PUT: Définir les départements où l'événement est diffusé (affiché dans la discussion jusqu'à fin d'événement ou suppression).
 * Remplace la diffusion actuelle.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; eventId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, eventId } = await params;
        const body = await request.json();
        const { target, departmentIds } = bodySchema.parse(body);

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_orgId: { userId: user.userId, orgId },
            },
        });
        if (!membership) {
            return NextResponse.json(
                { error: 'Vous n\'êtes pas membre de cette organisation' },
                { status: 403 }
            );
        }

        const event = await prisma.eventInvitation.findUnique({
            where: { id: eventId },
        });
        if (!event || event.orgId !== orgId) {
            return NextResponse.json(
                { error: 'Événement non trouvé' },
                { status: 404 }
            );
        }

        const deptIds =
            target === 'all'
                ? (await prisma.department.findMany({ where: { orgId }, select: { id: true } })).map((d) => d.id)
                : (departmentIds ?? []);

        const validDeptIds = await prisma.department.findMany({
            where: { id: { in: deptIds }, orgId },
            select: { id: true },
        });

        await prisma.eventDepartmentBroadcast.deleteMany({
            where: { eventId },
        });

        if (validDeptIds.length > 0) {
            await prisma.eventDepartmentBroadcast.createMany({
                data: validDeptIds.map((d) => ({ eventId, deptId: d.id })),
                skipDuplicates: true,
            });
        }

        return NextResponse.json({
            message: 'Diffusion mise à jour',
            broadcastCount: validDeptIds.length,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Event broadcast update error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour de la diffusion' },
            { status: 500 }
        );
    }
}
