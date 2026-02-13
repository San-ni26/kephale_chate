/**
 * API admin - Valider ou rejeter un ordre de paiement
 * PATCH: action = approve | reject
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireAdmin, AuthenticatedRequest } from '@/src/middleware/auth';
import { generateOrganizationCode } from '@/src/lib/otp';
import { getSubscriptionLimits, calculateSubscriptionEndDate } from '@/src/lib/subscription';
import type { SubscriptionPlan } from '@/src/prisma/client';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    const { id } = await params;

    try {
        const body = await request.json();
        const { action } = body;

        if (!['approve', 'reject'].includes(action)) {
            return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
        }

        const order = await prisma.paymentOrder.findUnique({
            where: { id },
        });

        if (!order) {
            return NextResponse.json({ error: 'Ordre non trouvé' }, { status: 404 });
        }

        if (order.status !== 'PENDING') {
            return NextResponse.json({ error: 'Cet ordre a déjà été traité' }, { status: 400 });
        }

        if (action === 'reject') {
            await prisma.paymentOrder.update({
                where: { id },
                data: { status: 'REJECTED', rejectedAt: new Date() },
            });
            return NextResponse.json({ message: 'Ordre rejeté' });
        }

        const plan = order.plan as SubscriptionPlan;
        const limits = getSubscriptionLimits(plan);
        const startDate = new Date();
        const endDate = calculateSubscriptionEndDate(startDate, plan);

        // === UPGRADE : mise à jour de l'abonnement existant ===
        if (order.type === 'UPGRADE' && order.orgId) {
            await prisma.$transaction(async (tx) => {
                const existingSub = await tx.subscription.findUnique({
                    where: { orgId: order.orgId! },
                });

                if (existingSub) {
                    await tx.subscription.update({
                        where: { orgId: order.orgId! },
                        data: {
                            plan,
                            startDate,
                            endDate,
                            maxDepartments: limits.maxDepartments,
                            maxMembersPerDept: limits.maxMembersPerDept,
                            isActive: true,
                        },
                    });
                } else {
                    await tx.subscription.create({
                        data: {
                            orgId: order.orgId!,
                            plan,
                            startDate,
                            endDate,
                            maxDepartments: limits.maxDepartments,
                            maxMembersPerDept: limits.maxMembersPerDept,
                            isActive: true,
                        },
                    });
                }

                await tx.paymentOrder.update({
                    where: { id },
                    data: {
                        status: 'APPROVED',
                        approvedBy: user!.userId,
                        approvedAt: new Date(),
                    },
                });
            });

            return NextResponse.json({ message: 'Abonnement mis à jour avec succès' });
        }

        // === CREATE : créer l'organisation ===
        let code = generateOrganizationCode();
        let codeExists = await prisma.organization.findUnique({ where: { code } });
        while (codeExists) {
            code = generateOrganizationCode();
            codeExists = await prisma.organization.findUnique({ where: { code } });
        }

        await prisma.$transaction(async (tx) => {
            const organization = await tx.organization.create({
                data: {
                    name: order.name,
                    code,
                    logo: order.logo,
                    address: order.address,
                    ownerId: order.userId,
                    members: {
                        create: {
                            userId: order.userId,
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
            });

            if (order.requestId) {
                await tx.organizationRequest.update({
                    where: { id: order.requestId },
                    data: { orgId: organization.id, status: 'COMPLETED' },
                });
            }

            await tx.paymentOrder.update({
                where: { id },
                data: {
                    status: 'APPROVED',
                    approvedBy: user!.userId,
                    approvedAt: new Date(),
                },
            });
        });

        return NextResponse.json({ message: 'Ordre approuvé et organisation créée' });
    } catch (error) {
        console.error('Payment order action error:', error);
        return NextResponse.json({ error: 'Erreur lors du traitement' }, { status: 500 });
    }
}
