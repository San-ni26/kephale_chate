import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { sendJobApplicationConfirmationEmail } from '@/src/lib/email';
import { supabaseAdmin, STORAGE_BUCKET } from '@/src/lib/supabase';

async function uploadBase64ToStorage(base64Data: string, jobId: string, filename: string): Promise<{ url: string; storageKey: string } | null> {
    const base64Match = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!base64Match) return null;
    const mimeType = base64Match[1];
    const buffer = Buffer.from(base64Match[2], 'base64');
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `job-applications/${jobId}/${Date.now()}_${safeName}`;
    const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(storageKey, buffer, { contentType: mimeType, upsert: false });
    if (error) { console.error('[Jobs Apply] Upload error:', error); return null; }
    const { data: publicData } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storageKey);
    return { url: publicData.publicUrl, storageKey };
}

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

    // Convertir les éventuels base64 résiduels vers Supabase Storage
    let finalPhotoData = photoData || null;
    let finalCvData = cvData || null;
    let finalCoverLetterData = coverLetterData || null;
    let finalPortfolioData = portfolioData || null;
    let photoStorageKey: string | undefined;
    let cvStorageKey: string | undefined;
    let coverLetterStorageKey: string | undefined;
    let portfolioStorageKey: string | undefined;

    if (photoData?.startsWith('data:')) {
        const r = await uploadBase64ToStorage(photoData, jobId, 'photo');
        if (r) { finalPhotoData = r.url; photoStorageKey = r.storageKey; }
    }
    if (cvData?.startsWith('data:')) {
        const r = await uploadBase64ToStorage(cvData, jobId, 'cv.pdf');
        if (r) { finalCvData = r.url; cvStorageKey = r.storageKey; }
    }
    if (coverLetterData?.startsWith('data:')) {
        const r = await uploadBase64ToStorage(coverLetterData, jobId, 'lettre.pdf');
        if (r) { finalCoverLetterData = r.url; coverLetterStorageKey = r.storageKey; }
    }
    if (portfolioData?.startsWith('data:')) {
        const r = await uploadBase64ToStorage(portfolioData, jobId, 'portfolio');
        if (r) { finalPortfolioData = r.url; portfolioStorageKey = r.storageKey; }
    }

    const application = await prisma.jobApplication.create({
        data: {
            jobId,
            fullName: fullName || null,
            email: email.toLowerCase(),
            phone: phone || null,
            address: address || null,
            photoData: finalPhotoData,
            cvData: finalCvData,
            coverLetterData: finalCoverLetterData,
            portfolioUrl: portfolioUrl || null,
            portfolioData: finalPortfolioData,
            photoStorageKey: photoStorageKey || null,
            cvStorageKey: cvStorageKey || null,
            coverLetterStorageKey: coverLetterStorageKey || null,
            portfolioStorageKey: portfolioStorageKey || null,
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
