import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { generateOrganizationCode } from '@/src/lib/otp';
import { getSubscriptionLimits, calculateSubscriptionEndDate } from '@/src/lib/subscription';
import { calculateUserProEndDate } from '@/src/lib/user-pro';
import type { SubscriptionPlan } from '@/src/prisma/client';

/**
 * URL de notification CinetPay (notify_url)
 * Doc: https://docs.cinetpay.com/api/1.0-fr/checkout/notification
 *
 * - GET : CinetPay ping → 200
 * - POST : notification de paiement → vérification puis création de l'organisation si ACCEPTED
 */

const CINETPAY_CHECK_URL = 'https://api-checkout.cinetpay.com/v2/payment/check';

export async function GET() {
    return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
    try {
        let body: Record<string, string>;
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            body = Object.fromEntries(
                Array.from(formData.entries()).map(([k, v]) => [k, String(v)])
            ) as Record<string, string>;
        } else {
            body = (await request.json().catch(() => ({}))) as Record<string, string>;
        }

        const cpmTransId = body?.cpm_trans_id || body?.transaction_id;
        const cpmSiteId = body?.cpm_site_id || body?.site_id;

        if (!cpmTransId || !cpmSiteId) {
            console.warn('CinetPay notify: cpm_trans_id ou cpm_site_id manquant', body);
            return new NextResponse(null, { status: 200 });
        }

        const apikey = process.env.CINETPAY_API_KEY?.trim();
        if (!apikey) {
            console.error('CinetPay notify: CINETPAY_API_KEY manquant');
            return new NextResponse(null, { status: 200 });
        }

        const checkRes = await fetch(CINETPAY_CHECK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apikey,
                site_id: cpmSiteId,
                transaction_id: cpmTransId,
            }),
        });

        const checkData = await checkRes.json().catch(() => ({}));

        if (String(checkData?.code) !== '00' || checkData?.data?.status !== 'ACCEPTED') {
            console.log('CinetPay notify statut non ACCEPTED:', checkData?.code, checkData?.data?.status);
            return new NextResponse(null, { status: 200 });
        }

        const pending = await prisma.pendingSubscriptionPayment.findUnique({
            where: { transactionId: cpmTransId },
        });

        if (!pending) {
            console.log('CinetPay notify: aucun pending pour transaction_id', cpmTransId);
            return new NextResponse(null, { status: 200 });
        }

        const startDate = new Date();

        // === USER_PRO : abonnement Compte Pro utilisateur ===
        if (pending.type === 'USER_PRO') {
            const userProPlan = pending.plan as 'MONTHLY' | 'SIX_MONTHS' | 'TWELVE_MONTHS';
            const endDate = calculateUserProEndDate(startDate, userProPlan);

            await prisma.$transaction(async (tx) => {
                const existing = await tx.userProSubscription.findUnique({
                    where: { userId: pending.userId },
                });

                if (existing) {
                    await tx.userProSubscription.update({
                        where: { userId: pending.userId },
                        data: {
                            plan: userProPlan,
                            startDate,
                            endDate,
                            isActive: true,
                        },
                    });
                } else {
                    await tx.userProSubscription.create({
                        data: {
                            userId: pending.userId,
                            plan: userProPlan,
                            startDate,
                            endDate,
                            isActive: true,
                        },
                    });
                }

                await tx.userProSettings.upsert({
                    where: { userId: pending.userId },
                    create: { userId: pending.userId },
                    update: {},
                });

                await tx.pendingSubscriptionPayment.delete({
                    where: { id: pending.id },
                });
            });

            console.log('CinetPay: Compte Pro activé après paiement', {
                transaction_id: cpmTransId,
                userId: pending.userId,
                plan: pending.plan,
            });

            return new NextResponse(null, { status: 200 });
        }

        const plan = pending.plan as SubscriptionPlan;
        const limits = getSubscriptionLimits(plan);
        const endDate = calculateSubscriptionEndDate(startDate, plan);

        // === UPGRADE : mise à jour de l'abonnement existant ===
        if (pending.type === 'UPGRADE' && pending.orgId) {
            await prisma.$transaction(async (tx) => {
                const existingSub = await tx.subscription.findUnique({
                    where: { orgId: pending.orgId! },
                });

                if (existingSub) {
                    await tx.subscription.update({
                        where: { orgId: pending.orgId! },
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
                            orgId: pending.orgId!,
                            plan,
                            startDate,
                            endDate,
                            maxDepartments: limits.maxDepartments,
                            maxMembersPerDept: limits.maxMembersPerDept,
                            isActive: true,
                        },
                    });
                }

                await tx.pendingSubscriptionPayment.delete({
                    where: { id: pending.id },
                });
            });

            console.log('CinetPay: abonnement mis à jour après paiement', {
                transaction_id: cpmTransId,
                orgId: pending.orgId,
                plan: pending.plan,
            });

            return new NextResponse(null, { status: 200 });
        }

        // === CREATE : création d'une nouvelle organisation ===
        let code = generateOrganizationCode();
        let codeExists = await prisma.organization.findUnique({ where: { code } });
        while (codeExists) {
            code = generateOrganizationCode();
            codeExists = await prisma.organization.findUnique({ where: { code } });
        }

        await prisma.$transaction(async (tx) => {
            const organization = await tx.organization.create({
                data: {
                    name: pending.name,
                    code,
                    logo: pending.logo,
                    address: pending.address,
                    ownerId: pending.userId,
                    members: {
                        create: {
                            userId: pending.userId,
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

            if (pending.requestId) {
                await tx.organizationRequest.update({
                    where: { id: pending.requestId },
                    data: {
                        orgId: organization.id,
                        status: 'COMPLETED',
                    },
                });
            }

            await tx.pendingSubscriptionPayment.delete({
                where: { id: pending.id },
            });
        });

        console.log('CinetPay: organisation créée après paiement', {
            transaction_id: cpmTransId,
            plan: pending.plan,
            name: pending.name,
        });

        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('CinetPay notify error:', error);
        return new NextResponse(null, { status: 200 });
    }
}
