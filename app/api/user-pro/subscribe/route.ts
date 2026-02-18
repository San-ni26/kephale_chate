/**
 * POST /api/user-pro/subscribe
 * Souscription au Compte Pro (CINETPAY ou MANUAL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import {
    getUserProPlanPrice,
    calculateUserProEndDate,
    type UserProPlan,
} from '@/src/lib/user-pro';
import { notifySuperAdminNewPaymentOrder } from '@/src/lib/notify-payment-order';

const CINETPAY_API_URL = 'https://api-checkout.cinetpay.com/v2/payment';

const subscribeSchema = z.object({
    plan: z.enum(['MONTHLY', 'SIX_MONTHS', 'TWELVE_MONTHS']),
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

export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const parsed = subscribeSchema.parse(body);
        const plan = parsed.plan as UserProPlan;

        // Nettoyer les PendingSubscriptionPayment expirés (> 24h) pour permettre un nouveau paiement CinetPay
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await prisma.pendingSubscriptionPayment.deleteMany({
            where: {
                userId: user.userId,
                type: 'USER_PRO',
                createdAt: { lt: cutoff },
            },
        });

        // Vérifier s'il y a déjà un paiement en attente
        const existingOrder = await prisma.paymentOrder.findFirst({
            where: {
                userId: user.userId,
                type: 'USER_PRO',
                status: 'PENDING',
            },
        });

        if (existingOrder) {
            return NextResponse.json(
                { error: 'Un abonnement Pro est déjà en attente de traitement par un administrateur.' },
                { status: 409 }
            );
        }

        // Supprimer un ancien PendingSubscriptionPayment (CinetPay) pour permettre une nouvelle tentative
        await prisma.pendingSubscriptionPayment.deleteMany({
            where: {
                userId: user.userId,
                type: 'USER_PRO',
            },
        });

        const amountFcfa = getUserProPlanPrice(plan);

        // Mode de paiement (même que les abonnements org)
        const paymentModeSetting = await prisma.paymentSetting.findUnique({
            where: { key: 'subscription_payment_mode' },
        });
        const paymentMode = paymentModeSetting?.value || 'CINETPAY';

        if (paymentMode === 'MANUAL') {
            const dbUser = await prisma.user.findUnique({
                where: { id: user.userId },
                select: { name: true, email: true },
            });

            const order = await prisma.paymentOrder.create({
                data: {
                    userId: user.userId,
                    plan,
                    name: dbUser?.name || 'Compte Pro',
                    orgId: null,
                    type: 'USER_PRO',
                    amountFcfa,
                    status: 'PENDING',
                },
            });

            try {
                await notifySuperAdminNewPaymentOrder({
                    orderId: order.id,
                    plan,
                    name: dbUser?.name || 'Compte Pro',
                    amountFcfa,
                    type: 'USER_PRO',
                });
            } catch (notifErr) {
                console.error('[UserPro/subscribe] Notify super admin error:', notifErr);
            }

            return NextResponse.json({
                status: 'success',
                mode: 'MANUAL',
                message: 'Votre demande d\'abonnement Pro a été envoyée. Elle sera traitée par un administrateur.',
                orderId: order.id,
                plan,
                amount: amountFcfa,
            });
        }

        // Mode CINETPAY
        const feeRate = 0.02;
        const amountWithFees = Math.round(amountFcfa * (1 + feeRate));
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

        const dbUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { name: true, email: true, phone: true },
        });

        const transactionId = `pro-${plan}-${user.userId.slice(-6)}-${Date.now()}`;

        await prisma.pendingSubscriptionPayment.create({
            data: {
                transactionId,
                userId: user.userId,
                plan,
                name: dbUser?.name || 'Compte Pro',
                orgId: null,
                type: 'USER_PRO',
            },
        });

        const description = `Compte Pro ${plan} - ${amount} FCFA`.replace(/[#/$_&]/g, ' ');
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
            metadata: JSON.stringify({ plan, userId: user.userId, type: 'USER_PRO', ref: transactionId }),
        };

        const custName = (parsed.customer_name?.trim() || dbUser?.name) || 'Client';
        const custSurname = (parsed.customer_surname?.trim() || dbUser?.name?.split(/\s+/)[0]) || ' ';
        const custEmail = parsed.customer_email?.trim() || dbUser?.email || `contact-${transactionId}@placeholder.local`;
        const custPhone = parsed.customer_phone_number?.trim() || dbUser?.phone || '770000000';
        const custAddress = parsed.customer_address?.trim() || 'Adresse non renseignée';
        const custCity = parsed.customer_city?.trim() || 'Abidjan';
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
            plan,
            baseAmount: amountFcfa,
            amountCharged: amount,
            transactionId,
            paymentUrl,
        });
    } catch (error) {
        console.error('User Pro subscribe error:', error);

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
