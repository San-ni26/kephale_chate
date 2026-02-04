import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
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
        const { id: orgId, deptId } = await params;

        // Verify user is member of the organization
        const orgMember = await prisma.organizationMember.findFirst({
            where: {
                userId,
                orgId,
            },
        });

        if (!orgMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // Get department with members
        const department = await prisma.department.findUnique({
            where: { id: deptId },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                isOnline: true,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        members: true,
                    },
                },
            },
        });

        if (!department || department.orgId !== orgId) {
            return NextResponse.json({ error: 'Département non trouvé' }, { status: 404 });
        }

        return NextResponse.json({ department });
    } catch (error) {
        console.error('Get department error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { id: orgId, deptId } = await params;

        // Verify user is ADMIN or OWNER of the organization
        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
            select: { role: true }
        });

        if (!orgMember || (orgMember.role !== 'ADMIN' && orgMember.role !== 'OWNER')) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // Verify department exists and belongs to org
        const department = await prisma.department.findUnique({
            where: { id: deptId }
        });

        if (!department || department.orgId !== orgId) {
            return NextResponse.json({ error: 'Département non trouvé' }, { status: 404 });
        }

        // Transaction to delete groups (conversations) effectively
        // DepartmentMembers are set to Cascade in schema, so they will be deleted automatically.
        // Groups might be SetNull or Restrict depending on DB, so we explicitly delete them to remove messages/attachments.
        await prisma.$transaction(async (tx) => {
            // Find groups in this department
            const groups = await tx.group.findMany({
                where: { deptId: deptId },
                select: { id: true }
            });

            // Delete groups (cascades to messages -> attachments)
            if (groups.length > 0) {
                await tx.group.deleteMany({
                    where: { id: { in: groups.map(g => g.id) } }
                });
            }

            // Delete department (cascades to members)
            await tx.department.delete({
                where: { id: deptId }
            });
        });

        return NextResponse.json({ message: 'Département supprimé' });
    } catch (error) {
        console.error('Delete department error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { id: orgId, deptId } = await params;

        const body = await request.json();
        const { name } = body;

        if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });

        // Verify user is ADMIN or OWNER
        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
            select: { role: true }
        });

        if (!orgMember || (orgMember.role !== 'ADMIN' && orgMember.role !== 'OWNER')) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // Update department
        const department = await prisma.department.update({
            where: { id: deptId },
            data: { name }
        });

        return NextResponse.json({ department });
    } catch (error) {
        console.error('Update department error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
