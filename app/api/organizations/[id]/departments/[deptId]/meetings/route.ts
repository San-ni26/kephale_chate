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

        const meetings = await prisma.departmentMeeting.findMany({
            where: { deptId },
            include: {
                creator: {
                    select: { id: true, name: true, email: true },
                },
            },
            orderBy: { meetingDate: 'desc' },
        });

        return NextResponse.json({ meetings });
    } catch (error) {
        console.error('Get meetings error:', error);
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
            return NextResponse.json({ error: 'Seuls les admins ou le chef du département peuvent créer des réunions' }, { status: 403 });
        }

        const body = await request.json();
        const { title, description, agenda, meetingDate, location } = body;

        if (!title || !meetingDate) {
            return NextResponse.json({ error: 'Titre et date de réunion requis' }, { status: 400 });
        }

        const meeting = await prisma.departmentMeeting.create({
            data: {
                deptId,
                title,
                description: description || null,
                agenda: agenda || null,
                meetingDate: new Date(meetingDate),
                location: location || null,
                createdBy: payload.userId,
            },
            include: {
                creator: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        return NextResponse.json({ meeting });
    } catch (error) {
        console.error('Create meeting error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
