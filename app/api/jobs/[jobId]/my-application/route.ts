import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

// GET /api/jobs/[jobId]/my-application — Vérifier si l'utilisateur a déjà postulé
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    const authError = await authenticate(req);
    if (authError) return NextResponse.json({ application: null }); // Non connecté = pas de candidature

    const user = (req as AuthenticatedRequest).user;
    if (!user?.email) {
        return NextResponse.json({ application: null });
    }

    const { jobId } = await params;

    const application = await prisma.jobApplication.findFirst({
        where: {
            jobId,
            email: user.email.toLowerCase(),
        },
    });

    if (!application) {
        return NextResponse.json({ application: null });
    }

    return NextResponse.json({
        application: {
            id: application.id,
            status: application.status,
            createdAt: application.createdAt,
            fullName: application.fullName,
            email: application.email,
            phone: application.phone,
            address: application.address,
            educationLevel: application.educationLevel,
            experience: application.experience,
            desiredSalary: application.desiredSalary,
            availability: application.availability,
            socialLinks: application.socialLinks,
            customAnswers: application.customAnswers,
            hasCv: !!application.cvData,
            hasCoverLetter: !!application.coverLetterData,
            hasPhoto: !!application.photoData,
        },
    });
}
