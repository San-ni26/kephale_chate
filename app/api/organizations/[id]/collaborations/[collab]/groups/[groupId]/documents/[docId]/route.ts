import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string; groupId: string; docId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const { id: orgId, collab: collabId, groupId, docId } = await params;

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

        const doc = await prisma.collaborationDocument.findFirst({
            where: { id: docId, groupId },
        });

        if (!doc) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }

        if (doc.uploadedBy !== user.userId) {
            return NextResponse.json({ error: 'Vous ne pouvez supprimer que vos propres documents' }, { status: 403 });
        }

        await prisma.collaborationDocument.delete({ where: { id: docId } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete collaboration document error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
