import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';

const reviewRequestSchema = z.object({
    action: z.enum(['approve', 'reject']),
});

// PATCH: Approve or reject organization request (admin only)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        // Check if user is admin
        const dbUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { role: true },
        });

        if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'SUPER_ADMIN')) {
            return NextResponse.json(
                { error: 'Accès non autorisé. Seuls les administrateurs peuvent approuver les demandes.' },
                { status: 403 }
            );
        }

        const { id: requestId } = await params;
        const body = await request.json();
        const validatedData = reviewRequestSchema.parse(body);

        const orgRequest = await prisma.organizationRequest.findUnique({
            where: { id: requestId },
        });

        if (!orgRequest) {
            return NextResponse.json(
                { error: 'Demande non trouvée' },
                { status: 404 }
            );
        }

        if (orgRequest.status !== 'PENDING') {
            return NextResponse.json(
                { error: 'Cette demande a déjà été traitée' },
                { status: 400 }
            );
        }

        const newStatus = validatedData.action === 'approve' ? 'APPROVED' : 'REJECTED';

        const updatedRequest = await prisma.organizationRequest.update({
            where: { id: requestId },
            data: {
                status: newStatus,
                reviewedBy: user.userId,
                reviewedAt: new Date(),
            },
        });

        return NextResponse.json(
            {
                message: validatedData.action === 'approve'
                    ? 'Demande approuvée avec succès'
                    : 'Demande rejetée',
                request: updatedRequest,
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('Review organization request error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors du traitement de la demande' },
            { status: 500 }
        );
    }
}

// DELETE: Cancel pending request (user only)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: requestId } = await params;

        const orgRequest = await prisma.organizationRequest.findUnique({
            where: { id: requestId },
        });

        if (!orgRequest) {
            return NextResponse.json(
                { error: 'Demande non trouvée' },
                { status: 404 }
            );
        }

        if (orgRequest.userId !== user.userId) {
            return NextResponse.json(
                { error: 'Vous ne pouvez annuler que vos propres demandes' },
                { status: 403 }
            );
        }

        if (orgRequest.status !== 'PENDING') {
            return NextResponse.json(
                { error: 'Seules les demandes en attente peuvent être annulées' },
                { status: 400 }
            );
        }

        await prisma.organizationRequest.delete({
            where: { id: requestId },
        });

        return NextResponse.json(
            { message: 'Demande annulée avec succès' },
            { status: 200 }
        );

    } catch (error) {
        console.error('Delete organization request error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de l\'annulation de la demande' },
            { status: 500 }
        );
    }
}
