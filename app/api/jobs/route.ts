import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

// GET /api/jobs — Offres d'emploi publiées (accès public)
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city') || undefined;
    const contractType = searchParams.get('contractType') || undefined;
    const workMode = searchParams.get('workMode') || undefined;
    const search = searchParams.get('search') || undefined;
    const orgId = searchParams.get('orgId') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const skip = (page - 1) * limit;

    const where: any = {
        status: 'PUBLISHED',
        ...(city && { city: { contains: city, mode: 'insensitive' } }),
        ...(contractType && { contractType }),
        ...(workMode && { workMode }),
        ...(orgId && { orgId }),
        ...(search && {
            OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { companyName: { contains: search, mode: 'insensitive' } },
                { skills: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
            ],
        }),
    };

    const [jobs, total] = await Promise.all([
        prisma.jobOffer.findMany({
            where,
            select: {
                id: true,
                orgId: true,
                companyName: true,
                companyLogo: true,
                city: true,
                title: true,
                contractType: true,
                location: true,
                workMode: true,
                salary: true,
                deadline: true,
                positionsCount: true,
                publishedAt: true,
                skills: true,
                educationLevel: true,
                experience: true,
                _count: { select: { applications: true } },
                organization: { select: { id: true, name: true, logo: true } },
            },
            orderBy: { publishedAt: 'desc' },
            skip,
            take: limit,
        }),
        prisma.jobOffer.count({ where }),
    ]);

    return NextResponse.json({
        jobs,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    });
}
