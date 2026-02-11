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

        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'MONTHLY';
        const periodKey = searchParams.get('periodKey') || '';

        const where: { deptId: string; period?: string; periodKey?: string } = { deptId };
        if (period) where.period = period;
        if (periodKey) where.periodKey = periodKey;

        const goals = await prisma.departmentGoal.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ goals });
    } catch (error) {
        console.error('Get goals error:', error);
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
            return NextResponse.json({ error: 'Seuls les admins ou le chef du département peuvent créer des objectifs' }, { status: 403 });
        }

        const body = await request.json();
        const { title, description, targetValue, currentValue, period, periodKey } = body;

        if (!title || !period || !periodKey) {
            return NextResponse.json({ error: 'Titre, période et clé de période requis' }, { status: 400 });
        }

        const goal = await prisma.departmentGoal.create({
            data: {
                deptId,
                title,
                description: description || null,
                targetValue: targetValue != null ? Number(targetValue) : 100,
                currentValue: currentValue != null ? Number(currentValue) : 0,
                period,
                periodKey,
            },
        });

        return NextResponse.json({ goal });
    } catch (error) {
        console.error('Create goal error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
