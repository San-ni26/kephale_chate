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
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

        const polls = await prisma.departmentPoll.findMany({
            where: { deptId },
            include: {
                creator: { select: { id: true, name: true, email: true } },
                votes: { select: { userId: true, optionIndex: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ polls });
    } catch (error) {
        console.error('Get polls error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access || (!access.isOrgAdmin && !access.isDeptHead)) {
            return NextResponse.json({ error: 'Seuls les admins ou le chef du département peuvent créer des sondages' }, { status: 403 });
        }

        const body = await request.json();
        const { question, options, endDate } = body;

        if (!question || !Array.isArray(options) || options.length < 2) {
            return NextResponse.json({ error: 'Question et au moins 2 options requises' }, { status: 400 });
        }

        const poll = await prisma.departmentPoll.create({
            data: {
                deptId,
                question,
                options: options as string[],
                endDate: endDate ? new Date(endDate) : null,
                createdBy: payload.userId,
            },
            include: {
                creator: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ poll });
    } catch (error) {
        console.error('Create poll error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
