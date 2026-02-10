import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

/**
 * GET: List all members of the organization (id, name, email) for event invitations etc.
 */
export async function GET(
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

        const { id: orgId } = await params;

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_orgId: {
                    userId: user.userId,
                    orgId,
                },
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Vous n\'êtes pas membre de cette organisation' },
                { status: 403 }
            );
        }

        const members = await prisma.organizationMember.findMany({
            where: { orgId },
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

        const list = members.map((m) => ({
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            role: m.role,
        }));

        return NextResponse.json({ members: list }, { status: 200 });
    } catch (error) {
        console.error('Get organization members error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des membres' },
            { status: 500 }
        );
    }
}

/**
 * PATCH: Modifier le rôle d'un membre (OWNER uniquement). Permet d'attribuer ADMIN pour "tout faire" dans l'org.
 * Body: { userId: string, role: 'ADMIN' | 'MEMBER' }
 */
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

        const { id: orgId } = await params;
        const body = await request.json();
        const { userId: targetUserId, role } = body;

        if (!targetUserId || !role) {
            return NextResponse.json(
                { error: 'userId et role requis' },
                { status: 400 }
            );
        }
        if (role !== 'ADMIN' && role !== 'MEMBER') {
            return NextResponse.json(
                { error: 'Rôle invalide (ADMIN ou MEMBER)' },
                { status: 400 }
            );
        }

        const org = await prisma.organization.findUnique({
            where: { id: orgId },
        });
        if (!org) {
            return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });
        }
        if (org.ownerId !== user.userId) {
            return NextResponse.json(
                { error: 'Seul le propriétaire peut modifier les rôles' },
                { status: 403 }
            );
        }

        const targetMember = await prisma.organizationMember.findUnique({
            where: {
                userId_orgId: { userId: targetUserId, orgId },
            },
        });
        if (!targetMember) {
            return NextResponse.json(
                { error: 'Membre non trouvé dans cette organisation' },
                { status: 404 }
            );
        }
        if (targetMember.role === 'OWNER') {
            return NextResponse.json(
                { error: 'Impossible de modifier le rôle du propriétaire' },
                { status: 400 }
            );
        }

        await prisma.organizationMember.update({
            where: { id: targetMember.id },
            data: { role },
        });

        return NextResponse.json({ success: true, role }, { status: 200 });
    } catch (error) {
        console.error('PATCH organization member role error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

/**
 * DELETE: Supprimer un membre de l'organisation (OWNER uniquement).
 * Body: { userId: string }
 * Retire le membre de tous les départements et de l'organisation.
 */
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

        const { id: orgId } = await params;
        const body = await request.json();
        const { userId: targetUserId } = body;

        if (!targetUserId) {
            return NextResponse.json({ error: 'userId requis' }, { status: 400 });
        }

        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { ownerId: true },
        });
        if (!org) {
            return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });
        }
        if (org.ownerId !== user.userId) {
            return NextResponse.json(
                { error: 'Seul le propriétaire peut supprimer des membres de l\'organisation' },
                { status: 403 }
            );
        }
        if (targetUserId === org.ownerId) {
            return NextResponse.json(
                { error: 'Impossible de supprimer le propriétaire de l\'organisation' },
                { status: 400 }
            );
        }

        const targetMember = await prisma.organizationMember.findUnique({
            where: {
                userId_orgId: { userId: targetUserId, orgId },
            },
        });
        if (!targetMember) {
            return NextResponse.json(
                { error: 'Membre non trouvé dans cette organisation' },
                { status: 404 }
            );
        }

        const deptIds = await prisma.department.findMany({
            where: { orgId },
            select: { id: true },
        }).then((d) => d.map((x) => x.id));

        const groups = await prisma.group.findMany({
            where: { deptId: { in: deptIds } },
            select: { id: true },
        });

        await prisma.$transaction(async (tx) => {
            for (const g of groups) {
                await tx.groupMember.deleteMany({
                    where: { groupId: g.id, userId: targetUserId },
                });
            }
            await tx.departmentMember.deleteMany({
                where: { userId: targetUserId, department: { orgId } },
            });
            await tx.organizationMember.delete({
                where: { id: targetMember.id },
            });
        });

        return NextResponse.json({ success: true, message: 'Membre supprimé de l\'organisation' }, { status: 200 });
    } catch (error) {
        console.error('DELETE organization member error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
