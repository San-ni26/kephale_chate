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
    const deptMember = await prisma.departmentMember.findFirst({
        where: { userId, deptId },
    });
    const isOrgAdmin = orgMember && (orgMember.role === 'OWNER' || orgMember.role === 'ADMIN');
    const isDeptHead = department.headId === userId;
    const isDeptMember = !!deptMember;
    if (!isOrgAdmin && !isDeptHead && !isDeptMember) return null;
    return { isOrgAdmin, isDeptHead, isDeptMember };
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; decisionId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, decisionId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

        const decision = await prisma.teamDecision.findFirst({
            where: { id: decisionId, deptId },
            include: {
                creator: { select: { id: true, name: true, email: true } },
                votes: { select: { userId: true, vote: true } },
            },
        });

        if (!decision) return NextResponse.json({ error: 'Décision non trouvée' }, { status: 404 });
        return NextResponse.json({ decision });
    } catch (error) {
        console.error('Get decision error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; decisionId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, decisionId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access || (!access.isOrgAdmin && !access.isDeptHead)) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const decision = await prisma.teamDecision.findFirst({
            where: { id: decisionId, deptId },
        });
        if (!decision) return NextResponse.json({ error: 'Décision non trouvée' }, { status: 404 });

        const body = await request.json();
        const { title, description, voteDeadline, status } = body;

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (voteDeadline !== undefined) updateData.voteDeadline = voteDeadline ? new Date(voteDeadline) : null;
        if (status !== undefined && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            updateData.status = status;
        }

        const updated = await prisma.teamDecision.update({
            where: { id: decisionId },
            data: updateData,
            include: {
                creator: { select: { id: true, name: true, email: true } },
                votes: { select: { userId: true, vote: true } },
            },
        });

        return NextResponse.json({ decision: updated });
    } catch (error) {
        console.error('Update decision error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; decisionId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, decisionId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access || (!access.isOrgAdmin && !access.isDeptHead)) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const decision = await prisma.teamDecision.findFirst({
            where: { id: decisionId, deptId },
        });
        if (!decision) return NextResponse.json({ error: 'Décision non trouvée' }, { status: 404 });

        await prisma.teamDecision.delete({ where: { id: decisionId } });
        return NextResponse.json({ message: 'Décision supprimée' });
    } catch (error) {
        console.error('Delete decision error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
