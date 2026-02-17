import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, collab: collabId } = await params;

        const collaboration = await prisma.organizationCollaboration.findFirst({
            where: {
                id: collabId,
                orgBId: orgId,
                status: 'PENDING',
            },
        });

        if (!collaboration) {
            return NextResponse.json(
                { error: 'Collaboration non trouvée ou déjà traitée' },
                { status: 404 }
            );
        }

        const membership = await prisma.organizationMember.findUnique({
            where: { userId_orgId: { userId: user.userId, orgId } },
        });

        if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
            return NextResponse.json(
                { error: 'Seuls les propriétaires et administrateurs peuvent refuser' },
                { status: 403 }
            );
        }

        await prisma.organizationCollaboration.update({
            where: { id: collabId },
            data: { status: 'REJECTED', invitedBy: null },
        });

        const updated = await prisma.organizationCollaboration.findUnique({
            where: { id: collabId },
            include: {
                orgA: { select: { id: true, name: true, code: true, logo: true } },
                orgB: { select: { id: true, name: true, code: true, logo: true } },
            },
        });

        return NextResponse.json({
            message: 'Invitation refusée',
            collaboration: updated,
        });
    } catch (error) {
        console.error('Reject collaboration error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
