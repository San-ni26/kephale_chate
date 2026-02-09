import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';
import { generateOrganizationCode } from '@/src/lib/otp';
import { getSubscriptionLimits, calculateSubscriptionEndDate } from '@/src/lib/subscription';
import { SubscriptionPlan } from '@/src/prisma/client';

const completeOrgSchema = z.object({
    requestId: z.string(),
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    logo: z.string().optional(),
    address: z.string().optional(),
    plan: z.enum(['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']),
});

// POST: Complete organization setup after approval
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const validatedData = completeOrgSchema.parse(body);

        // Check if request exists and is approved
        const orgRequest = await prisma.organizationRequest.findUnique({
            where: { id: validatedData.requestId },
        });

        if (!orgRequest) {
            return NextResponse.json(
                { error: 'Demande non trouvée' },
                { status: 404 }
            );
        }

        if (orgRequest.userId !== user.userId) {
            return NextResponse.json(
                { error: 'Cette demande ne vous appartient pas' },
                { status: 403 }
            );
        }

        if (orgRequest.status !== 'APPROVED') {
            return NextResponse.json(
                { error: 'Cette demande n\'a pas été approuvée' },
                { status: 400 }
            );
        }

        if (orgRequest.orgId) {
            return NextResponse.json(
                { error: 'Cette demande a déjà été complétée' },
                { status: 400 }
            );
        }

        // Generate unique 12-digit code
        let code = generateOrganizationCode();
        let codeExists = await prisma.organization.findUnique({ where: { code } });

        while (codeExists) {
            code = generateOrganizationCode();
            codeExists = await prisma.organization.findUnique({ where: { code } });
        }

        // Get subscription limits
        const plan = validatedData.plan as SubscriptionPlan;
        const limits = getSubscriptionLimits(plan);
        const startDate = new Date();
        const endDate = calculateSubscriptionEndDate(startDate, plan); // 1 mois pour tous les plans

        // Create organization with subscription in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const organization = await tx.organization.create({
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

            // Update request with organization ID and status
            await tx.organizationRequest.update({
                where: { id: validatedData.requestId },
                data: {
                    orgId: organization.id,
                    status: 'COMPLETED',
                },
            });

            return organization;
        });

        return NextResponse.json(
            {
                message: 'Organisation créée avec succès',
                organization: result,
                code,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Complete organization error:', error);

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
