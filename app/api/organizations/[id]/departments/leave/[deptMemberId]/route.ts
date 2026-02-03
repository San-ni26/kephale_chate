import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptMemberId: string }> }
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
        const { id: orgId, deptMemberId } = await params;

        // Get the department member record
        const deptMember = await prisma.departmentMember.findUnique({
            where: { id: deptMemberId },
            include: {
                department: {
                    select: {
                        id: true,
                        orgId: true,
                    },
                },
            },
        });

        if (!deptMember) {
            return NextResponse.json({ error: 'Membre non trouvé' }, { status: 404 });
        }

        // Verify the department belongs to the organization
        if (deptMember.department.orgId !== orgId) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // Verify the user is leaving their own membership
        if (deptMember.userId !== userId) {
            return NextResponse.json({ error: 'Vous ne pouvez quitter que vos propres départements' }, { status: 403 });
        }

        // Remove from department conversation if exists
        const conversation = await prisma.group.findFirst({
            where: {
                deptId: deptMember.deptId,
                isDirect: false,
            },
        });

        if (conversation) {
            await prisma.groupMember.deleteMany({
                where: {
                    groupId: conversation.id,
                    userId,
                },
            });
        }

        // Remove from department
        await prisma.departmentMember.delete({
            where: { id: deptMemberId },
        });

        return NextResponse.json(
            { message: 'Vous avez quitté le département avec succès' },
            { status: 200 }
        );
    } catch (error) {
        console.error('Leave department error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
