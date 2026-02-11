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

export async function POST(
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
        });
        if (!poll) return NextResponse.json({ error: 'Sondage non trouvé' }, { status: 404 });

        if (poll.endDate && new Date(poll.endDate) < new Date()) {
            return NextResponse.json({ error: 'Ce sondage est terminé' }, { status: 400 });
        }

        const body = await request.json();
        const { optionIndex } = body;

        const options = poll.options as string[];
        if (typeof optionIndex !== 'number' || optionIndex < 0 || optionIndex >= options.length) {
            return NextResponse.json({ error: 'Option invalide' }, { status: 400 });
        }

        const existing = await prisma.pollVote.findUnique({
            where: {
                pollId_userId: { pollId, userId: payload.userId },
            },
        });

        if (existing) {
            await prisma.pollVote.update({
                where: { id: existing.id },
                data: { optionIndex },
            });
        } else {
            await prisma.pollVote.create({
                data: {
                    pollId,
                    userId: payload.userId,
                    optionIndex,
                },
            });
        }

        const updated = await prisma.departmentPoll.findUnique({
            where: { id: pollId },
            include: {
                votes: { select: { userId: true, optionIndex: true } },
            },
        });

        return NextResponse.json({ poll: updated, message: 'Vote enregistré' });
    } catch (error) {
        console.error('Vote poll error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
