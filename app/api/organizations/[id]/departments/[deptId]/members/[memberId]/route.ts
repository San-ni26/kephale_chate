import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; memberId: string }> }
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
        const { id: orgId, deptId, memberId } = await params;

        // Verify user is admin or owner of the organization
        const orgMember = await prisma.organizationMember.findFirst({
            where: {
                userId,
                orgId,
            },
        });

        if (!orgMember || (orgMember.role !== 'ADMIN' && orgMember.role !== 'OWNER')) {
            return NextResponse.json({ error: 'Accès refusé - Droits administrateur requis' }, { status: 403 });
        }

        // Get the department member to remove
        const deptMember = await prisma.departmentMember.findUnique({
            where: { id: memberId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        if (!deptMember || deptMember.deptId !== deptId) {
            return NextResponse.json({ error: 'Membre non trouvé' }, { status: 404 });
        }

        // Don't allow removing yourself
        if (deptMember.userId === userId) {
            return NextResponse.json({ error: 'Vous ne pouvez pas vous retirer vous-même' }, { status: 400 });
        }

        // Remove from department conversation if exists
        const conversation = await prisma.group.findFirst({
            where: {
                deptId,
                isDirect: false,
            },
        });

        if (conversation) {
            await prisma.groupMember.deleteMany({
                where: {
                    groupId: conversation.id,
                    userId: deptMember.userId,
                },
            });
        }

        // Remove from department
        await prisma.departmentMember.delete({
            where: { id: memberId },
        });

        return NextResponse.json(
            { message: 'Membre retiré avec succès' },
            { status: 200 }
        );
    } catch (error) {
        console.error('Remove department member error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
