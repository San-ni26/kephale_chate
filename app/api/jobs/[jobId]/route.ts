import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

// GET /api/jobs/[jobId] — Détail d'une offre (public)
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    const { jobId } = await params;

    const job = await prisma.jobOffer.findUnique({
        where: { id: jobId, status: 'PUBLISHED' },
        include: {
            organization: { select: { id: true, name: true, logo: true, address: true } },
        },
    });

    if (!job) return NextResponse.json({ error: 'Offre non trouvée ou indisponible' }, { status: 404 });

    return NextResponse.json({ job });
}
