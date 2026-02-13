import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
import { notifyDepartmentTaskAssigned } from '@/src/lib/notify-department';

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
        const { title, description, assigneeId, priority, dueDate, startDate, attachments } = body;

        if (!title || !assigneeId) {
            return NextResponse.json({ error: 'Titre et assigné requis' }, { status: 400 });
        }

        // Vérifier: org OWNER/ADMIN OU chef du département peut créer/assigner des tâches
        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
            select: { role: true }
        });
        const department = await prisma.department.findUnique({
            where: { id: deptId },
            select: { headId: true }
        });
        const isOrgAdmin = orgMember && (orgMember.role === 'OWNER' || orgMember.role === 'ADMIN');
        const isDeptHead = department?.headId === userId;

        if (!isOrgAdmin && !isDeptHead) {
            return NextResponse.json({ error: 'Seuls le propriétaire, un admin de l\'organisation ou le chef du département peuvent créer des tâches' }, { status: 403 });
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
                attachments: Array.isArray(attachments) && attachments.length > 0
                    ? {
                        create: attachments.map((att: { url: string; filename: string; fileType?: string; size?: number }) => ({
                            uploaderId: userId,
                            filename: att.filename,
                            url: att.url,
                            fileType: att.fileType ?? undefined,
                            size: att.size ?? undefined,
                        })),
                    }
                    : undefined,
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
                },
                attachments: true,
            }
        });

        try {
            await notifyDepartmentTaskAssigned({
                orgId,
                deptId,
                taskId: task.id,
                taskTitle: task.title,
                assigneeId: task.assigneeId,
                creatorName: task.creator?.name || 'Un membre',
            });
        } catch (notifErr) {
            console.error('[Dept tasks] Notify assignee error:', notifErr);
        }

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

        const department = await prisma.department.findUnique({
            where: { id: deptId },
            select: { headId: true }
        });
        const isOrgAdmin = orgMember && (orgMember.role === 'OWNER' || orgMember.role === 'ADMIN');
        const isDeptHead = department?.headId === userId;
        const canSeeAllTasks = isOrgAdmin || isDeptHead;

        const tasks = await prisma.task.findMany({
            where: canSeeAllTasks ? { deptId } : { deptId, assigneeId: userId },
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
