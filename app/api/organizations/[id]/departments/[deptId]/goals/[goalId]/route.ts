import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

async function checkDeptAccess(orgId: string, deptId: string, userId: string) {
    const orgMember = await prisma.organizationMember.findFirst({
        where: { userId, orgId },
        select: { role: true },
    });
    const department = await prisma.department.findUnique({
        where: { id: deptId },
        select: { orgId: true, headId: true },
    });
    if (!department || department.orgId !== orgId) return null;
    const isOrgAdmin = orgMember && (orgMember.role === 'OWNER' || orgMember.role === 'ADMIN');
    const isDeptHead = department.headId === userId;
    return { isOrgAdmin, isDeptHead };
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; goalId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, goalId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access || (!access.isOrgAdmin && !access.isDeptHead)) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const goal = await prisma.departmentGoal.findFirst({
            where: { id: goalId, deptId },
        });
        if (!goal) return NextResponse.json({ error: 'Objectif non trouvé' }, { status: 404 });

        const body = await request.json();
        const { title, description, targetValue, currentValue } = body;

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (targetValue !== undefined) updateData.targetValue = Number(targetValue);
        if (currentValue !== undefined) updateData.currentValue = Number(currentValue);

        const updated = await prisma.departmentGoal.update({
            where: { id: goalId },
            data: updateData,
        });

        return NextResponse.json({ goal: updated });
    } catch (error) {
        console.error('Update goal error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; goalId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, goalId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access || (!access.isOrgAdmin && !access.isDeptHead)) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const goal = await prisma.departmentGoal.findFirst({
            where: { id: goalId, deptId },
        });
        if (!goal) return NextResponse.json({ error: 'Objectif non trouvé' }, { status: 404 });

        await prisma.departmentGoal.delete({ where: { id: goalId } });
        return NextResponse.json({ message: 'Objectif supprimé' });
    } catch (error) {
        console.error('Delete goal error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
