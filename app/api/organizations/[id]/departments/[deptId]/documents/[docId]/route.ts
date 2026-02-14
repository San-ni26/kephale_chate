import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; docId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
        }

        const userId = payload.userId;
        const { deptId, docId } = await params;

        const deptMember = await prisma.departmentMember.findFirst({
            where: { userId, deptId },
        });

        if (!deptMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const doc = await prisma.departmentDocument.findFirst({
            where: { id: docId, deptId },
        });

        if (!doc) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }

        // Seul l'uploader ou un admin peut supprimer (on autorise l'uploader pour simplifier)
        if (doc.uploadedBy !== userId) {
            return NextResponse.json({ error: 'Vous ne pouvez supprimer que vos propres documents' }, { status: 403 });
        }

        await prisma.departmentDocument.delete({
            where: { id: docId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete department document error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
