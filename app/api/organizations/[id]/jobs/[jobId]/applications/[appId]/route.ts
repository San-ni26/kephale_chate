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

// PATCH /api/organizations/[id]/jobs/[jobId]/applications/[appId]
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; jobId: string; appId: string }> }
) {
    const { id: orgId, jobId, appId } = await params;
    const user = getUser(req);
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
    });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    const app = await prisma.jobApplication.findUnique({
        where: { id: appId, jobId },
    });
    if (!app) return NextResponse.json({ error: 'Candidature non trouvée' }, { status: 404 });

    const { status, internalNote } = await req.json();

    const updated = await prisma.jobApplication.update({
        where: { id: appId },
        data: {
            ...(status !== undefined && { status }),
            ...(internalNote !== undefined && { internalNote }),
        },
    });

    return NextResponse.json({ application: updated });
}

// GET /api/organizations/[id]/jobs/[jobId]/applications/[appId]
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; jobId: string; appId: string }> }
) {
    const { id: orgId, jobId, appId } = await params;
    const user = getUser(req);
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
    });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    const application = await prisma.jobApplication.findUnique({
        where: { id: appId, jobId },
        include: { jobOffer: true },
    });
    if (!application) return NextResponse.json({ error: 'Candidature non trouvée' }, { status: 404 });

    return NextResponse.json({ application });
}
