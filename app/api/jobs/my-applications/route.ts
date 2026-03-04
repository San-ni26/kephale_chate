import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { decryptPII } from '@/src/lib/server-crypto';

// GET /api/jobs/my-applications — Candidatures de l'utilisateur connecté
export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user?.userId) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Récupérer l'email depuis la DB (déchiffré) pour garantir la correspondance
    const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { email: true },
    });
    if (!dbUser) {
        return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }
    const userEmail = (decryptPII(dbUser.email) || dbUser.email || user.email || '').toLowerCase().trim();
    const jwtEmail = (user.email || '').toLowerCase().trim();
    const emailsToMatch = [...new Set([userEmail, jwtEmail].filter(Boolean))];
    if (emailsToMatch.length === 0) {
        return NextResponse.json({ applications: [] });
    }

    const applications = await prisma.jobApplication.findMany({
        where: { email: { in: emailsToMatch } },
        orderBy: { createdAt: 'desc' },
        include: {
            jobOffer: {
                select: {
                    id: true,
                    title: true,
                    companyName: true,
                    companyLogo: true,
                    location: true,
                    contractType: true,
                    workMode: true,
                    status: true,
                },
            },
        },
    });

    return NextResponse.json({
        applications: applications.map((a) => ({
            id: a.id,
            status: a.status,
            createdAt: a.createdAt,
            fullName: a.fullName,
            email: a.email,
            phone: a.phone,
            address: a.address,
            educationLevel: a.educationLevel,
            experience: a.experience,
            socialLinks: a.socialLinks,
            desiredSalary: a.desiredSalary,
            availability: a.availability,
            customAnswers: a.customAnswers,
            portfolioUrl: a.portfolioUrl,
            hasPhoto: !!a.photoData,
            hasCv: !!a.cvData,
            hasCoverLetter: !!a.coverLetterData,
            hasPortfolio: !!a.portfolioData,
            job: a.jobOffer,
        })),
    });
}
