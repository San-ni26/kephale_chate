import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

export async function POST(
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
        const { title, description, assigneeId, priority, dueDate, startDate } = body;

        if (!title || !assigneeId) {
            return NextResponse.json({ error: 'Titre et assigné requis' }, { status: 400 });
        }

        // Verify user is ADMIN or OWNER locally
        // Or check if user is a member of the department?
        // User said: "le createur de l'organisations puise donne atribue des tache a un membre du departement"
        // So Creator (Owner) or Admin can assign tasks.
        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
            select: { role: true }
        });

        if (!orgMember || (orgMember.role !== 'OWNER' && orgMember.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Seul les admins/propriétaires peuvent créer des tâches' }, { status: 403 });
        }

        // Verify assignee is in the department
        const assigneeMember = await prisma.departmentMember.findFirst({
            where: {
                deptId,
                userId: assigneeId
            }
        });

        if (!assigneeMember) {
            return NextResponse.json({ error: "L'utilisateur n'est pas membre de ce département" }, { status: 400 });
        }

        const task = await prisma.task.create({
            data: {
                title,
                description,
                status: 'PENDING',
                priority: priority || 'MEDIUM',
                startDate: startDate ? new Date(startDate) : null,
                dueDate: dueDate ? new Date(dueDate) : null,
                deptId,
                creatorId: userId,
                assigneeId,
            },
            include: {
                assignee: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true
                    }
                },
                creator: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        return NextResponse.json({ task });
    } catch (error) {
        console.error('Create task error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId } = await params;

        // Verify access to department
        const userId = payload.userId;

        // Check if user is org admin/owner OR department member
        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
            select: { role: true }
        });

        const deptMember = await prisma.departmentMember.findFirst({
            where: { userId, deptId }
        });

        if (!deptMember && (!orgMember || (orgMember.role !== 'OWNER' && orgMember.role !== 'ADMIN'))) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const tasks = await prisma.task.findMany({
            where: { deptId },
            include: {
                assignee: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true
                    }
                },
                creator: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                _count: {
                    select: {
                        messages: true,
                        attachments: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json({ tasks });
    } catch (error) {
        console.error('Get tasks error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
