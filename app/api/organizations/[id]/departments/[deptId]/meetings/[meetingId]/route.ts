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
    { params }: { params: Promise<{ id: string; deptId: string; meetingId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, meetingId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

        const meeting = await prisma.departmentMeeting.findFirst({
            where: { id: meetingId, deptId },
            include: {
                creator: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        if (!meeting) return NextResponse.json({ error: 'Réunion non trouvée' }, { status: 404 });
        return NextResponse.json({ meeting });
    } catch (error) {
        console.error('Get meeting error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; meetingId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, meetingId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access || (!access.isOrgAdmin && !access.isDeptHead)) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const meeting = await prisma.departmentMeeting.findFirst({
            where: { id: meetingId, deptId },
        });
        if (!meeting) return NextResponse.json({ error: 'Réunion non trouvée' }, { status: 404 });

        const body = await request.json();
        const { title, description, agenda, meetingDate, location } = body;

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (agenda !== undefined) updateData.agenda = agenda;
        if (meetingDate !== undefined) updateData.meetingDate = new Date(meetingDate);
        if (location !== undefined) updateData.location = location;

        const updated = await prisma.departmentMeeting.update({
            where: { id: meetingId },
            data: updateData,
            include: {
                creator: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ meeting: updated });
    } catch (error) {
        console.error('Update meeting error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; meetingId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, meetingId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access || (!access.isOrgAdmin && !access.isDeptHead)) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const meeting = await prisma.departmentMeeting.findFirst({
            where: { id: meetingId, deptId },
        });
        if (!meeting) return NextResponse.json({ error: 'Réunion non trouvée' }, { status: 404 });

        const body = await request.json();
        const { minutes } = body;

        const updated = await prisma.departmentMeeting.update({
            where: { id: meetingId },
            data: {
                minutes: minutes ?? meeting.minutes,
                minutesAt: minutes != null ? new Date() : meeting.minutesAt,
            },
            include: {
                creator: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ meeting: updated });
    } catch (error) {
        console.error('Update meeting minutes error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; meetingId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const { id: orgId, deptId, meetingId } = await params;
        const access = await checkDeptAccess(orgId, deptId, payload.userId);
        if (!access || (!access.isOrgAdmin && !access.isDeptHead)) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const meeting = await prisma.departmentMeeting.findFirst({
            where: { id: meetingId, deptId },
        });
        if (!meeting) return NextResponse.json({ error: 'Réunion non trouvée' }, { status: 404 });

        await prisma.departmentMeeting.delete({ where: { id: meetingId } });
        return NextResponse.json({ message: 'Réunion supprimée' });
    } catch (error) {
        console.error('Delete meeting error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
