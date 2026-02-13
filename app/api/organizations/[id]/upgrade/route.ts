/**
 * POST /api/organizations/[id]/upgrade
 * Initie un changement d'abonnement avec paiement.
 *
 * Supporte deux modes :
 *   - CINETPAY : crée un PendingSubscriptionPayment puis redirige vers CinetPay
 *   - MANUAL   : crée un PaymentOrder en attente d'approbation admin
 *
 * GET /api/organizations/[id]/upgrade
 * Retourne les ordres de paiement upgrade en cours pour cette organisation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { SUBSCRIPTION_PLANS, getSubscriptionLimits, calculateSubscriptionEndDate } from '@/src/lib/subscription';
import type { SubscriptionPlan } from '@/src/prisma/client';
import { notifySuperAdminNewPaymentOrder } from '@/src/lib/notify-payment-order';

const CINETPAY_API_URL = 'https://api-checkout.cinetpay.com/v2/payment';

const upgradeSchema = z.object({
    plan: z.enum(['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']),
    customer_name: z.string().optional(),
    customer_surname: z.string().optional(),
    customer_email: z.string().optional(),
    customer_phone_number: z.string().optional(),
    customer_address: z.string().optional(),
    customer_city: z.string().optional(),
    customer_country: z.string().max(2).optional(),
    customer_state: z.string().max(2).optional(),
    customer_zip_code: z.string().max(10).optional(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId } = await params;
        const body = await request.json();
        const parsed = upgradeSchema.parse(body);

        // Vérifier l'organisation et les droits
        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            include: { subscription: true },
        });

        if (!org) {
            return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });
        }

        if (org.ownerId !== user.userId) {
            return NextResponse.json({ error: 'Réservé au propriétaire' }, { status: 403 });
        }

        const currentPlan = (org.subscription?.plan || 'FREE') as SubscriptionPlan;
        const newPlan = parsed.plan as SubscriptionPlan;

        if (newPlan === currentPlan) {
            return NextResponse.json({ error: 'Vous êtes déjà sur ce plan' }, { status: 400 });
        }

        const newPlanConfig = SUBSCRIPTION_PLANS[newPlan];

        // Si passage au plan FREE → changement direct sans paiement
        if (newPlan === 'FREE') {
            const limits = getSubscriptionLimits(newPlan);
            const startDate = new Date();
            const endDate = calculateSubscriptionEndDate(startDate, newPlan);

            if (org.subscription) {
                await prisma.subscription.update({
                    where: { orgId },
                    data: {
                        plan: newPlan,
                        startDate,
                        endDate,
                        maxDepartments: limits.maxDepartments,
                        maxMembersPerDept: limits.maxMembersPerDept,
                    },
                });
            } else {
                await prisma.subscription.create({
                    data: {
                        orgId,
                        plan: newPlan,
                        startDate,
                        endDate,
                        maxDepartments: limits.maxDepartments,
                        maxMembersPerDept: limits.maxMembersPerDept,
                    },
                });
            }

            return NextResponse.json({
                status: 'success',
                mode: 'FREE_DOWNGRADE',
                message: 'Abonnement mis à jour vers le plan gratuit',
            });
        }

        // Vérifier s'il y a déjà un ordre de paiement PENDING pour cette org
        const existingOrder = await prisma.paymentOrder.findFirst({
            where: {
                orgId,
                type: 'UPGRADE',
                status: 'PENDING',
            },
        });

        if (existingOrder) {
            return NextResponse.json(
                { error: 'Un changement d\'abonnement est déjà en attente de traitement.' },
                { status: 409 }
            );
        }

        // Vérifier s'il y a déjà un paiement CinetPay en attente
        const existingPending = await prisma.pendingSubscriptionPayment.findFirst({
            where: {
                orgId,
                type: 'UPGRADE',
            },
        });

        if (existingPending) {
            return NextResponse.json(
                { error: 'Un paiement de mise à niveau est déjà en cours.' },
                { status: 409 }
            );
        }

        // Déterminer le mode de paiement
        const paymentModeSetting = await prisma.paymentSetting.findUnique({
            where: { key: 'subscription_payment_mode' },
        });
        const paymentMode = paymentModeSetting?.value || 'CINETPAY';

        const baseAmount = newPlanConfig.price;

        if (paymentMode === 'MANUAL') {
            // Mode manuel : créer un ordre en attente d'approbation admin
            const order = await prisma.paymentOrder.create({
                data: {
                    userId: user.userId,
                    plan: newPlan,
                    name: org.name,
                    logo: org.logo,
                    address: org.address,
                    orgId,
                    type: 'UPGRADE',
                    amountFcfa: baseAmount,
                    status: 'PENDING',
                },
            });

            try {
                await notifySuperAdminNewPaymentOrder({
                    orderId: order.id,
                    plan: order.plan,
                    name: order.name,
                    amountFcfa: order.amountFcfa,
                    type: 'UPGRADE',
                });
            } catch (notifErr) {
                console.error('[Organizations/upgrade] Notify super admin error:', notifErr);
            }

            return NextResponse.json({
                status: 'success',
                mode: 'MANUAL',
                message: 'Votre demande de changement d\'abonnement a été envoyée. Elle sera traitée par un administrateur.',
                orderId: order.id,
                plan: newPlan,
                amount: baseAmount,
            });
        }

        // Mode CinetPay : initier le paiement en ligne
        const feeRate = 0.02;
        const amountWithFees = Math.round(baseAmount * (1 + feeRate));
        const amount = Math.max(5, Math.round(amountWithFees / 5) * 5);

        const apikey = process.env.CINETPAY_API_KEY?.trim();
        const siteId = process.env.CINETPAY_SITE_ID?.trim();

        if (!apikey || !siteId) {
            return NextResponse.json(
                { error: 'Configuration CinetPay manquante.' },
                { status: 500 }
            );
        }

        const notifyUrl = process.env.CINETPAY_NOTIFY_URL?.trim();
        const returnUrl = process.env.CINETPAY_RETURN_URL?.trim();

        if (!notifyUrl || !returnUrl) {
            return NextResponse.json(
                { error: 'URLs CinetPay manquantes.' },
                { status: 500 }
            );
        }

        const transactionId = `upg-${newPlan}-${orgId.slice(-6)}-${Date.now()}`;

        await prisma.pendingSubscriptionPayment.create({
            data: {
                transactionId,
                userId: user.userId,
                plan: newPlan,
                name: org.name,
                logo: org.logo || null,
                address: org.address || null,
                orgId,
                type: 'UPGRADE',
            },
        });

        const description = `Upgrade ${newPlan} - ${amount} FCFA`.replace(/[#/$_&]/g, ' ');
        const channels = process.env.CINETPAY_CHANNELS || 'ALL';
        const defaultCountry = process.env.CINETPAY_DEFAULT_COUNTRY || 'ML';

        const payload: Record<string, unknown> = {
            apikey,
            site_id: siteId,
            transaction_id: transactionId,
            amount,
            currency: 'XOF',
            description,
            notify_url: notifyUrl,
            return_url: returnUrl,
            channels,
            lang: process.env.CINETPAY_LANG || 'fr',
            metadata: JSON.stringify({ plan: newPlan, orgId, type: 'UPGRADE', ref: transactionId }),
        };

        const custName = (parsed.customer_name?.trim() || org.name) || 'Client';
        const custSurname = (parsed.customer_surname?.trim() || org.name.split(/\s+/)[0]) || ' ';
        const custEmail = parsed.customer_email?.trim() || `contact-${transactionId}@placeholder.local`;
        const custPhone = parsed.customer_phone_number?.trim() || '770000000';
        const custAddress = parsed.customer_address?.trim() || org.address?.trim() || 'Adresse non renseignée';
        const custCity = parsed.customer_city?.trim() || 'Bamako';
        const custCountry = (parsed.customer_country?.trim() || defaultCountry).toUpperCase().slice(0, 2);
        const custState = (parsed.customer_state?.trim() || defaultCountry).toUpperCase().slice(0, 2);
        const custZip = parsed.customer_zip_code?.trim() || '00000';

        payload.customer_name = custName;
        payload.customer_surname = custSurname;
        payload.customer_email = custEmail;
        payload.customer_phone_number = custPhone;
        payload.customer_address = custAddress;
        payload.customer_city = custCity;
        payload.customer_country = custCountry;
        payload.customer_state = custState;
        payload.customer_zip_code = custZip;

        const response = await fetch(CINETPAY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Kephale-App/1.0',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            await prisma.pendingSubscriptionPayment.deleteMany({ where: { transactionId } }).catch(() => {});
            return NextResponse.json(
                { error: data?.description || 'La demande de paiement a échoué', details: data },
                { status: 502 }
            );
        }

        if (String(data?.code) !== '201' || !data?.data?.payment_url) {
            await prisma.pendingSubscriptionPayment.deleteMany({ where: { transactionId } }).catch(() => {});
            return NextResponse.json(
                { error: data?.description || 'Impossible de créer le lien de paiement.', details: data },
                { status: 502 }
            );
        }

        const paymentUrl = data.data.payment_url as string;

        return NextResponse.json({
            status: 'success',
            mode: 'CINETPAY',
            plan: newPlan,
            baseAmount,
            amountCharged: amount,
            transactionId,
            paymentUrl,
        });
    } catch (error) {
        console.error('Upgrade subscription error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors du traitement' },
            { status: 500 }
        );
    }
}

/**
 * GET: Retourne les ordres/paiements upgrade en cours pour cette organisation
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId } = await params;

        // Vérifier l'accès
        const member = await prisma.organizationMember.findFirst({
            where: { userId: user.userId, orgId },
        });

        if (!member) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // Ordres de paiement manuels pour upgrade
        const pendingOrders = await prisma.paymentOrder.findMany({
            where: {
                orgId,
                type: 'UPGRADE',
                status: 'PENDING',
            },
            orderBy: { createdAt: 'desc' },
        });

        // Paiements CinetPay en attente pour upgrade
        const pendingPayments = await prisma.pendingSubscriptionPayment.findMany({
            where: {
                orgId,
                type: 'UPGRADE',
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({
            pendingOrders,
            pendingPayments,
        });
    } catch (error) {
        console.error('Get upgrade status error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
