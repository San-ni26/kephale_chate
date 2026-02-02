import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';
import { generateOrganizationCode } from '@/src/lib/otp';

const createOrgSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    logo: z.string().optional(),
});

const joinOrgSchema = z.object({
    code: z.string().length(12, 'Le code doit contenir 12 chiffres'),
});

// GET: Get user's organizations
export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const organizations = await prisma.organization.findMany({
            where: {
                members: {
                    some: {
                        userId: user.userId,
                    },
                },
            },
            include: {
                members: {
                    where: {
                        userId: user.userId,
                    },
                    select: {
                        role: true,
                    },
                },
                subscription: true,
                departments: {
                    where: {
                        members: {
                            some: {
                                userId: user.userId,
                            },
                        },
                    },
                    include: {
                        members: {
                            where: {
                                userId: user.userId,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        members: true,
                        departments: true,
                        events: true,
                    },
                },
            },
        });

        return NextResponse.json({ organizations }, { status: 200 });

    } catch (error) {
        console.error('Get organizations error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des organisations' },
            { status: 500 }
        );
    }
}

// POST: Create a new organization or join existing one
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const { action } = body;

        if (action === 'create') {
            // Create new organization
            const validatedData = createOrgSchema.parse(body);

            // Generate unique 12-digit code
            let code = generateOrganizationCode();
            let codeExists = await prisma.organization.findUnique({ where: { code } });

            while (codeExists) {
                code = generateOrganizationCode();
                codeExists = await prisma.organization.findUnique({ where: { code } });
            }

            const organization = await prisma.organization.create({
                data: {
                    name: validatedData.name,
                    code,
                    logo: validatedData.logo,
                    ownerId: user.userId,
                    members: {
                        create: {
                            userId: user.userId,
                            role: 'OWNER',
                        },
                    },
                },
                include: {
                    members: true,
                },
            });

            return NextResponse.json(
                {
                    message: 'Organisation créée avec succès',
                    organization,
                    code,
                },
                { status: 201 }
            );

        } else if (action === 'join') {
            // Join existing organization
            const validatedData = joinOrgSchema.parse(body);

            const organization = await prisma.organization.findUnique({
                where: { code: validatedData.code },
            });

            if (!organization) {
                return NextResponse.json(
                    { error: 'Code d\'organisation invalide' },
                    { status: 404 }
                );
            }

            if (organization.isSuspended) {
                return NextResponse.json(
                    { error: 'Cette organisation est suspendue' },
                    { status: 403 }
                );
            }

            // Check if already a member
            const existingMember = await prisma.organizationMember.findUnique({
                where: {
                    userId_orgId: {
                        userId: user.userId,
                        orgId: organization.id,
                    },
                },
            });

            if (existingMember) {
                return NextResponse.json(
                    { error: 'Vous êtes déjà membre de cette organisation' },
                    { status: 400 }
                );
            }

            // Add user as member
            await prisma.organizationMember.create({
                data: {
                    userId: user.userId,
                    orgId: organization.id,
                    role: 'MEMBER',
                },
            });

            return NextResponse.json(
                {
                    message: 'Vous avez rejoint l\'organisation avec succès',
                    organization,
                },
                { status: 200 }
            );

        } else {
            return NextResponse.json(
                { error: 'Action invalide. Utilisez "create" ou "join"' },
                { status: 400 }
            );
        }

    } catch (error) {
        console.error('Organization action error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de l\'opération' },
            { status: 500 }
        );
    }
}
