import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { SUBSCRIPTION_PLANS } from '@/src/lib/subscription';
import type { SubscriptionPlan } from '@/src/prisma/client';

/**
 * Intégration CinetPay - Initialisation d'un paiement
 * Enregistre les données en attente (pending) puis redirige vers CinetPay.
 * Après paiement, la notification (notify_url) créera l'organisation.
 * Doc: https://docs.cinetpay.com/api/1.0-fr/checkout/initialisation
 */

const CINETPAY_API_URL = 'https://api-checkout.cinetpay.com/v2/payment';

const subscribeSchema = z.object({
    plan: z.enum(['BASIC', 'PROFESSIONAL', 'ENTERPRISE']),
    name: z.string().optional().transform((v) => (v?.trim() && v.trim().length >= 2 ? v.trim() : 'Organisation')),
    logo: z.string().optional(),
    address: z.string().optional(),
    requestId: z.string().optional(),
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
        const {
            plan,
            name,
            logo,
            address,
            requestId,
            customer_name,
            customer_surname,
            customer_email,
            customer_phone_number,
            customer_address,
            customer_city,
            customer_country,
            customer_state,
            customer_zip_code,
        } = parsed;

        const subscriptionPlan = plan as SubscriptionPlan;
        const config = SUBSCRIPTION_PLANS[subscriptionPlan];

        const baseAmount = config.price;
        const feeRate = 0.02;
        const amountWithFees = Math.round(baseAmount * (1 + feeRate));
        const amount = Math.max(5, Math.round(amountWithFees / 5) * 5);

        const apikey = process.env.CINETPAY_API_KEY?.trim();
        const siteId = process.env.CINETPAY_SITE_ID?.trim();

        if (!apikey || !siteId) {
            return NextResponse.json(
                {
                    error:
                        'Configuration CinetPay manquante. Définissez CINETPAY_API_KEY et CINETPAY_SITE_ID dans vos variables d’environnement.',
                },
                { status: 500 },
            );
        }

        const notifyUrl = process.env.CINETPAY_NOTIFY_URL?.trim();
        const returnUrl = process.env.CINETPAY_RETURN_URL?.trim();

        if (!notifyUrl || !returnUrl) {
            return NextResponse.json(
                {
                    error:
                        'URLs CinetPay manquantes. Définissez CINETPAY_NOTIFY_URL et CINETPAY_RETURN_URL.',
                },
                { status: 500 },
            );
        }

        const transactionId = `sub-${plan}-${Date.now()}`;

        await prisma.pendingSubscriptionPayment.create({
            data: {
                transactionId,
                userId: user.userId,
                plan,
                name,
                logo: logo || null,
                address: address?.trim() || null,
                requestId: requestId || null,
            },
        });

        const description = `Abonnement ${plan} - ${amount} FCFA`.replace(/[#/$_&]/g, ' ');

        const channels = process.env.CINETPAY_CHANNELS || 'ALL';
        const defaultCountry = process.env.CINETPAY_DEFAULT_COUNTRY || 'SN';

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
            metadata: JSON.stringify({ plan, ref: transactionId }),
        };

        const custName = (customer_name?.trim() || name) || 'Client';
        const custSurname = (customer_surname?.trim() || name.split(/\s+/)[0]) || ' ';
        const custEmail = customer_email?.trim() || `contact-${transactionId}@placeholder.local`;
        const custPhone = customer_phone_number?.trim() || '770000000';
        const custAddress = customer_address?.trim() || address?.trim() || 'Adresse non renseignée';
        const custCity = customer_city?.trim() || 'Ville';
        const custCountry = (customer_country?.trim() || defaultCountry).toUpperCase().slice(0, 2);
        const custState = (customer_state?.trim() || defaultCountry).toUpperCase().slice(0, 2);
        const custZip = customer_zip_code?.trim() || '00000';

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
            await prisma.pendingSubscriptionPayment.deleteMany({ where: { transactionId } }).catch(() => { });
            console.error('CinetPay HTTP error:', response.status, data);
            return NextResponse.json(
                {
                    error: data?.description || data?.message || 'La demande de paiement CinetPay a échoué',
                    details: data,
                },
                { status: 502 },
            );
        }

        if (String(data?.code) !== '201' || !data?.data?.payment_url) {
            await prisma.pendingSubscriptionPayment.deleteMany({ where: { transactionId } }).catch(() => { });
            console.error('CinetPay logical error:', data);
            return NextResponse.json(
                {
                    error: data?.description || data?.message || 'Impossible de créer le lien de paiement.',
                    details: data,
                },
                { status: 502 },
            );
        }

        const paymentUrl = data.data.payment_url as string;

        return NextResponse.json(
            {
                status: 'success',
                plan,
                baseAmount,
                amountCharged: amount,
                transactionId,
                paymentUrl,
                raw: data,
            },
            { status: 200 },
        );
    } catch (error) {
        console.error('CinetPay subscribe error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 },
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors du traitement du paiement' },
            { status: 500 },
        );
    }
}
