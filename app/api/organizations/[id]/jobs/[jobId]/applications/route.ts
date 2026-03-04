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

// GET /api/organizations/[id]/jobs/[jobId]/applications
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
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        return NextResponse.json({ error: 'Accès interdit - Admins uniquement' }, { status: 403 });
    }

    const job = await prisma.jobOffer.findUnique({ where: { id: jobId, orgId } });
    if (!job) return NextResponse.json({ error: 'Offre non trouvée' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;

    const applications = await prisma.jobApplication.findMany({
        where: {
            jobId,
            ...(status ? { status: status as any } : {}),
        },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ applications, job });
}
