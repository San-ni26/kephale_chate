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

        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { ownerId: true },
        });
        if (!org) {
            return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });
        }

        // Le propriétaire (user principal) ne peut jamais être retiré du département par personne
        // Seuls le propriétaire, un admin ou le chef du département peuvent retirer un membre (sauf le propriétaire)
        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
            select: { role: true },
        });
        const department = await prisma.department.findUnique({
            where: { id: deptId },
            select: { headId: true },
        });
        const isOrgOwner = orgMember?.role === 'OWNER';
        const isOrgAdmin = orgMember?.role === 'ADMIN';
        const isDeptHead = department?.headId === userId;

        if (!isOrgOwner && !isOrgAdmin && !isDeptHead) {
            return NextResponse.json({ error: 'Accès refusé - Droits requis' }, { status: 403 });
        }

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

        if (deptMember.userId === org.ownerId) {
            return NextResponse.json(
                { error: 'Impossible de retirer le propriétaire de l\'organisation du département' },
                { status: 403 }
            );
        }

        if (deptMember.userId === userId) {
            return NextResponse.json({ error: 'Utilisez "Quitter le département" pour vous retirer' }, { status: 400 });
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
