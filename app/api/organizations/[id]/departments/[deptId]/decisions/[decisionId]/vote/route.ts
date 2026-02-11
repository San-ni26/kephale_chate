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
        });
        if (!decision) return NextResponse.json({ error: 'Décision non trouvée' }, { status: 404 });

        if (decision.status !== 'PENDING') {
            return NextResponse.json({ error: 'Le vote est terminé pour cette décision' }, { status: 400 });
        }

        if (decision.voteDeadline && new Date(decision.voteDeadline) < new Date()) {
            return NextResponse.json({ error: 'La date limite de vote est dépassée' }, { status: 400 });
        }

        const body = await request.json();
        const { vote } = body;

        if (!['FOR', 'AGAINST', 'ABSTAIN'].includes(vote)) {
            return NextResponse.json({ error: 'Vote invalide (FOR, AGAINST ou ABSTAIN)' }, { status: 400 });
        }

        const existing = await prisma.decisionVote.findUnique({
            where: {
                decisionId_userId: { decisionId, userId: payload.userId },
            },
        });

        if (existing) {
            await prisma.decisionVote.update({
                where: { id: existing.id },
                data: { vote },
            });
        } else {
            await prisma.decisionVote.create({
                data: {
                    decisionId,
                    userId: payload.userId,
                    vote,
                },
            });
        }

        const updated = await prisma.teamDecision.findUnique({
            where: { id: decisionId },
            include: {
                creator: { select: { id: true, name: true, email: true } },
                votes: { select: { userId: true, vote: true } },
            },
        });

        return NextResponse.json({ decision: updated, message: 'Vote enregistré' });
    } catch (error) {
        console.error('Vote decision error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
