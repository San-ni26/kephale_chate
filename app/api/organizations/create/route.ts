import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';
import { generateOrganizationCode } from '@/src/lib/otp';
import { getSubscriptionLimits, calculateSubscriptionEndDate } from '@/src/lib/subscription';
import { SubscriptionPlan } from '@/src/prisma/client';

const createOrgSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    logo: z.string().optional(),
    address: z.string().optional(),
    plan: z.enum(['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']),
});

/**
 * POST: Création directe d'une organisation (sans étape code carte).
 * Génère automatiquement un code à 12 chiffres et crée l'org + abonnement.
 */
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const validatedData = createOrgSchema.parse(body);

        // Empêcher l'utilisation du plan gratuit plusieurs fois pour le même propriétaire
        if (validatedData.plan === 'FREE') {
            const existingFreeOrg = await prisma.organization.findFirst({
                where: {
                    ownerId: user.userId,
                    subscription: {
                        is: {
                            plan: 'FREE',
                        },
                    },
                },
            });

            if (existingFreeOrg) {
                return NextResponse.json(
                    {
                        error:
                            'Vous avez déjà utilisé le plan gratuit pour une organisation. ' +
                            'Veuillez choisir un plan payant pour créer une nouvelle organisation.',
                    },
                    { status: 400 },
                );
            }
        }

        // Générer un code unique à 12 chiffres
        let code = generateOrganizationCode();
        let codeExists = await prisma.organization.findUnique({ where: { code } });
        while (codeExists) {
            code = generateOrganizationCode();
            codeExists = await prisma.organization.findUnique({ where: { code } });
        }

        const plan = validatedData.plan as SubscriptionPlan;
        const limits = getSubscriptionLimits(plan);
        const startDate = new Date();
        const endDate = calculateSubscriptionEndDate(startDate, plan); // 1 mois pour tous les plans

        const organization = await prisma.organization.create({
            data: {
                name: validatedData.name,
                code,
                logo: validatedData.logo,
                address: validatedData.address,
                ownerId: user.userId,
                members: {
                    create: {
                        userId: user.userId,
                        role: 'OWNER',
                    },
                },
                subscription: {
                    create: {
                        plan,
                        startDate,
                        endDate,
                        maxDepartments: limits.maxDepartments,
                        maxMembersPerDept: limits.maxMembersPerDept,
                        isActive: true,
                    },
                },
            },
            include: {
                subscription: true,
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
    } catch (error) {
        console.error('Create organization error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        return NextResponse.json(
            { error: 'Erreur lors de la création de l\'organisation' },
            { status: 500 }
        );
    }
}
