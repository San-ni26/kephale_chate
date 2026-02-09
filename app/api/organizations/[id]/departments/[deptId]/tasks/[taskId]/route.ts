import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; taskId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { id: orgId, deptId, taskId } = await params;

        // Verify access (member of dept or org admin)
        const deptMember = await prisma.departmentMember.findFirst({
            where: { userId, deptId }
        });

        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId }
        });

        if (!deptMember && (!orgMember || (orgMember.role !== 'OWNER' && orgMember.role !== 'ADMIN'))) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                assignee: {
                    select: { id: true, name: true, avatarUrl: true, email: true }
                },
                creator: {
                    select: { id: true, name: true, avatarUrl: true }
                },
                messages: {
                    include: {
                        sender: {
                            select: { id: true, name: true, avatarUrl: true, publicKey: true }
                        },
                        attachments: true
                    },
                    orderBy: { createdAt: 'asc' }
                },
                attachments: true
            }
        });

        if (!task || task.deptId !== deptId) {
            return NextResponse.json({ error: 'Tâche non trouvée' }, { status: 404 });
        }

        return NextResponse.json({ task });
    } catch (error) {
        console.error('Get task error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; taskId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { id: orgId, deptId, taskId } = await params;
        const body = await request.json();
        const { status } = body;

        // Verify user permissions
        // Assignee can update status (usually to IN_PROGRESS, COMPLETED)
        // Creator/Admin can update status (to COMPLETED, CANCELLED, etc)

        const task = await prisma.task.findUnique({
            where: { id: taskId }
        });

        if (!task) return NextResponse.json({ error: 'Tâche non trouvée' }, { status: 404 });

        const isAssignee = task.assigneeId === userId;
        const isCreator = task.creatorId === userId;

        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId }
        });
        const isAdmin = orgMember && (orgMember.role === 'ADMIN' || orgMember.role === 'OWNER');

        if (!isAssignee && !isCreator && !isAdmin) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // Logic for "Request Confirmation"? existing requirement said "creation page d'execution ... confirmation d'execution par la user qui a attribue"
        // So maybe Assignee marks as 'COMPLETED' (or 'REVIEW_PENDING' if we had it, but we have COMPLETED).
        // Let's say Assignee marks COMPLETED. Or maybe we add a 'REVIEW' status?
        // Existing statuses: PENDING, IN_PROGRESS, COMPLETED, CANCELLED.
        // User said: "confirmations d'executions de la tache par la user qui a atrivue".
        // So Assignee likely shouldn't be able to simple set 'COMPLETED'.
        // Maybe Assignee sets 'IN_PROGRESS' -> then notifies done -> Creator sets 'COMPLETED'.
        // Or Assignee sets 'COMPLETED' but it needs approval?
        // For simplicity: Assignee sets 'COMPLETED', Creator can see it. 
        // Or better: Assignee sets 'COMPLETED', Creator verifies. If rejected, Creator sets back to 'IN_PROGRESS'.

        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: {
                status: status || task.status,
                completedAt: status === 'COMPLETED' ? new Date() : (status === 'IN_PROGRESS' ? null : task.completedAt)
            }
        });

        return NextResponse.json({ task: updatedTask });
    } catch (error) {
        console.error('Update task error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

// PATCH: Update task (title, description, assignee, priority, dates) — creator or org admin
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; taskId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { id: orgId, deptId, taskId } = await params;
        const body = await request.json();

        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task || task.deptId !== deptId) {
            return NextResponse.json({ error: 'Tâche non trouvée' }, { status: 404 });
        }

        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
            select: { role: true },
        });
        const isAdmin = orgMember && (orgMember.role === 'ADMIN' || orgMember.role === 'OWNER');
        const isCreator = task.creatorId === userId;
        if (!isCreator && !isAdmin) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const data: Record<string, unknown> = {};
        if (body.title !== undefined) data.title = body.title;
        if (body.description !== undefined) data.description = body.description;
        if (body.priority !== undefined) data.priority = body.priority;
        if (body.status !== undefined) {
            data.status = body.status;
            data.completedAt = body.status === 'COMPLETED' ? new Date() : body.status === 'IN_PROGRESS' ? null : task.completedAt;
        }
        if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
        if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
        if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data,
        });

        return NextResponse.json({ task: updatedTask });
    } catch (error) {
        console.error('PATCH task error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

// DELETE: Delete task — creator or org admin
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; taskId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { id: orgId, deptId, taskId } = await params;

        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task || task.deptId !== deptId) {
            return NextResponse.json({ error: 'Tâche non trouvée' }, { status: 404 });
        }

        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
            select: { role: true },
        });
        const isAdmin = orgMember && (orgMember.role === 'ADMIN' || orgMember.role === 'OWNER');
        const isCreator = task.creatorId === userId;
        if (!isCreator && !isAdmin) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        await prisma.task.delete({ where: { id: taskId } });
        return NextResponse.json({ message: 'Tâche supprimée' });
    } catch (error) {
        console.error('DELETE task error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
