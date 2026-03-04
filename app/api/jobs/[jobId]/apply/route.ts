import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { sendJobApplicationConfirmationEmail } from '@/src/lib/email';

// POST /api/jobs/[jobId]/apply — Postuler à une offre
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    const { jobId } = await params;

    const job = await prisma.jobOffer.findUnique({
        where: { id: jobId, status: 'PUBLISHED' },
        include: { organization: { select: { name: true } } },
    });

    if (!job) return NextResponse.json({ error: 'Offre non trouvée ou fermée' }, { status: 404 });

    // Vérifier la date limite
    if (job.deadline && new Date(job.deadline) < new Date()) {
        return NextResponse.json({ error: "La date limite de candidature est dépassée" }, { status: 400 });
    }

    const body = await req.json();
    const {
        fullName, email, phone, address,
        photoData, cvData, coverLetterData,
        portfolioUrl, portfolioData,
        educationLevel, experience,
        socialLinks, desiredSalary, availability,
        customAnswers,
    } = body;

    if (!email) {
        return NextResponse.json({ error: "L'email est obligatoire" }, { status: 400 });
    }

    // Vérifier les champs obligatoires selon formConfig
    const formConfig = job.formConfig as Record<string, string>;
    const fieldMap: Record<string, any> = {
        fullName, phone, address, photoData, cvData,
        coverLetterData, portfolioUrl, educationLevel,
        experience, socialLinks, desiredSalary, availability,
    };

    for (const [field, status] of Object.entries(formConfig)) {
        if (status === 'required' && !fieldMap[field]) {
            return NextResponse.json({
                error: `Le champ "${field}" est obligatoire`
            }, { status: 400 });
        }
    }

    // Vérifier si déjà postulé
    const existing = await prisma.jobApplication.findFirst({
        where: { jobId, email: email.toLowerCase() },
    });
    if (existing) {
        return NextResponse.json({ error: "Vous avez déjà postulé à cette offre" }, { status: 409 });
    }

    const application = await prisma.jobApplication.create({
        data: {
            jobId,
            fullName: fullName || null,
            email: email.toLowerCase(),
            phone: phone || null,
            address: address || null,
            photoData: photoData || null,
            cvData: cvData || null,
            coverLetterData: coverLetterData || null,
            portfolioUrl: portfolioUrl || null,
            portfolioData: portfolioData || null,
            educationLevel: educationLevel || null,
            experience: experience || null,
            socialLinks: socialLinks || null,
            desiredSalary: desiredSalary || null,
            availability: availability || null,
            customAnswers: customAnswers || null,
            status: 'PENDING',
        },
    });

    // Envoyer confirmation email via le système SMTP
    if (email) {
        try {
            await sendJobApplicationConfirmationEmail(
                email,
                fullName || null,
                job.title,
                job.companyName || job.organization?.name || 'Entreprise',
                job.location || ''
            );
        } catch (e) {
            console.error('Email confirmation error:', e);
        }
    }

    return NextResponse.json({
        success: true,
        applicationId: application.id,
        message: "Votre candidature a été envoyée avec succès !",
    }, { status: 201 });
}
