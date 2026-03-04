import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

function getUser(req: NextRequest) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return null;
    const payload = verifyToken(token);
    if (!payload) return null;
    return { id: payload.userId };
}

// GET /api/organizations/[id]/jobs/[jobId]
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; jobId: string }> }
) {
    const { id: orgId, jobId } = await params;
    const user = getUser(req);
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
    });
    if (!membership) return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });

    const job = await prisma.jobOffer.findUnique({
        where: { id: jobId, orgId },
        include: {
            creator: { select: { id: true, name: true, email: true } },
            _count: { select: { applications: true } },
        },
    });
    if (!job) return NextResponse.json({ error: 'Offre non trouvée' }, { status: 404 });

    return NextResponse.json({ job });
}

// PATCH /api/organizations/[id]/jobs/[jobId]
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; jobId: string }> }
) {
    const { id: orgId, jobId } = await params;
    const user = getUser(req);
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
    });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    const job = await prisma.jobOffer.findUnique({ where: { id: jobId, orgId } });
    if (!job) return NextResponse.json({ error: 'Offre non trouvée' }, { status: 404 });

    const body = await req.json();
    const {
        companyName, companyLogo, contactEmail, contactPhone,
        address, city, website,
        title, contractType, location, workMode,
        description, missions, skills, educationLevel, experience,
        salary, deadline, positionsCount,
        formConfig, customQuestions,
        status,
    } = body;

    const publishedAt = status === 'PUBLISHED' && job.status !== 'PUBLISHED'
        ? new Date()
        : job.publishedAt;

    const updated = await prisma.jobOffer.update({
        where: { id: jobId },
        data: {
            ...(companyName !== undefined && { companyName }),
            ...(companyLogo !== undefined && { companyLogo }),
            ...(contactEmail !== undefined && { contactEmail }),
            ...(contactPhone !== undefined && { contactPhone }),
            ...(address !== undefined && { address }),
            ...(city !== undefined && { city }),
            ...(website !== undefined && { website }),
            ...(title !== undefined && { title }),
            ...(contractType !== undefined && { contractType }),
            ...(location !== undefined && { location }),
            ...(workMode !== undefined && { workMode }),
            ...(description !== undefined && { description }),
            ...(missions !== undefined && { missions }),
            ...(skills !== undefined && { skills }),
            ...(educationLevel !== undefined && { educationLevel }),
            ...(experience !== undefined && { experience }),
            ...(salary !== undefined && { salary }),
            ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
            ...(positionsCount !== undefined && { positionsCount }),
            ...(formConfig !== undefined && { formConfig }),
            ...(customQuestions !== undefined && { customQuestions }),
            ...(status !== undefined && { status, publishedAt }),
        },
    });

    return NextResponse.json({ job: updated });
}

// DELETE /api/organizations/[id]/jobs/[jobId]
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; jobId: string }> }
) {
    const { id: orgId, jobId } = await params;
    const user = getUser(req);
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
    });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    await prisma.jobOffer.delete({ where: { id: jobId, orgId } });
    return NextResponse.json({ success: true });
}
