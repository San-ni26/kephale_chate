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
    { params }: { params: Promise<{ id: string; deptId: string; pollId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, pollId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

        const poll = await prisma.departmentPoll.findFirst({
            where: { id: pollId, deptId },
            include: {
                creator: { select: { id: true, name: true, email: true } },
                votes: { select: { userId: true, optionIndex: true } },
            },
        });

        if (!poll) return NextResponse.json({ error: 'Sondage non trouvé' }, { status: 404 });
        return NextResponse.json({ poll });
    } catch (error) {
        console.error('Get poll error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; pollId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, pollId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access || (!access.isOrgAdmin && !access.isDeptHead)) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const poll = await prisma.departmentPoll.findFirst({
            where: { id: pollId, deptId },
        });
        if (!poll) return NextResponse.json({ error: 'Sondage non trouvé' }, { status: 404 });

        await prisma.departmentPoll.delete({ where: { id: pollId } });
        return NextResponse.json({ message: 'Sondage supprimé' });
    } catch (error) {
        console.error('Delete poll error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
