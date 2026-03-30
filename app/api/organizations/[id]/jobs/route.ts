import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
import { decryptUserPII } from '@/src/lib/server-crypto';


// GET /api/organizations/[id]/jobs — Liste des offres (admins)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id: orgId } = await params;
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    const user = { id: payload.userId };

    // Vérifier que l'utilisateur est membre de l'organisation
    const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
    });
    if (!membership) return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });

    const isAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN';
    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        include: { subscription: true },
    });
    if (!org) return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;

    const jobs = await prisma.jobOffer.findMany({
        where: {
            orgId,
            ...(isAdmin ? {} : { status: 'PUBLISHED' }),
            ...(status ? { status: status as any } : {}),
        },
        include: {
            creator: { select: { id: true, name: true, email: true } },
            _count: { select: { applications: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
        jobs: decryptUserPII(jobs),
        subscription: org.subscription,
        isAdmin,
    });
}

// POST /api/organizations/[id]/jobs — Créer une offre
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id: orgId } = await params;
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    const user = { id: payload.userId };

    // Vérifier admin
    const membership = await prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
    });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        return NextResponse.json({ error: 'Accès interdit - Admins uniquement' }, { status: 403 });
    }

    // Vérifier l'abonnement
    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        include: { subscription: true },
    });
    if (!org) return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });

    const sub = org.subscription;
    if (!sub) return NextResponse.json({ error: "Aucun abonnement actif" }, { status: 403 });

    // Vérifier limite d'offres selon le plan
    const planLimits: Record<string, number> = {
        FREE: 0,
        BASIC: 3,
        PROFESSIONAL: 10,
        ENTERPRISE: 50,
        RECRUITMENT: 999,
    };
    const limit = planLimits[sub.plan] ?? sub.maxJobOffers ?? 0;

    if (limit === 0) {
        return NextResponse.json({
            error: "Votre abonnement ne permet pas de publier des offres d'emploi. Passez au plan RECRUITMENT ou PROFESSIONAL."
        }, { status: 403 });
    }

    const activeJobs = await prisma.jobOffer.count({
        where: { orgId, status: { in: ['DRAFT', 'PUBLISHED'] } },
    });

    if (limit !== 999 && activeJobs >= limit) {
        return NextResponse.json({
            error: `Limite atteinte (${limit} offre${limit > 1 ? 's' : ''} max pour votre plan)`
        }, { status: 403 });
    }

    const body = await req.json();
    const {
        companyName, companyLogo, contactEmail, contactPhone,
        address, city, website,
        title, contractType, location, workMode,
        description, missions, skills, educationLevel, experience,
        salary, deadline, positionsCount,
        formConfig, customQuestions,
        publish = false,
    } = body;

    if (!companyName || !contactEmail || !title || !contractType || !location || !workMode || !description) {
        return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 });
    }

    const job = await prisma.jobOffer.create({
        data: {
            orgId,
            companyName,
            companyLogo: companyLogo || null,
            contactEmail,
            contactPhone: contactPhone || null,
            address: address || null,
            city: city || null,
            website: website || null,
            title,
            contractType,
            location,
            workMode,
            description,
            missions: missions || null,
            skills: skills || null,
            educationLevel: educationLevel || null,
            experience: experience || null,
            salary: salary || null,
            deadline: deadline ? new Date(deadline) : null,
            positionsCount: positionsCount || 1,
            formConfig: formConfig || {},
            customQuestions: customQuestions || null,
            status: publish ? 'PUBLISHED' : 'DRAFT',
            publishedAt: publish ? new Date() : null,
            createdBy: user.id,
        },
    });

    return NextResponse.json({ job }, { status: 201 });
}
