/**
 * POST: Acheter les droits d'une discussion (Pro uniquement, discussion Pro/Pro)
 * Body: { duration: 'THREE_MONTHS' | 'SIX_MONTHS' | 'TWELVE_MONTHS' }
 * Utilise le système de paiement de la plateforme (CinetPay ou MANUAL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { isUserProActive } from '@/src/lib/user-pro';
import {
    getExpiresAt,
    getDiscussionRightPrice,
    DISCUSSION_RIGHT_DURATIONS,
    type DiscussionRightDuration,
} from '@/src/lib/discussion-rights';
import { notifySuperAdminNewPaymentOrder } from '@/src/lib/notify-payment-order';

const CINETPAY_API_URL = 'https://api-checkout.cinetpay.com/v2/payment';

const VALID_DURATIONS: DiscussionRightDuration[] = [
    'THREE_MONTHS',
    'SIX_MONTHS',
    'TWELVE_MONTHS',
];

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: groupId } = await params;
        const body = await request.json().catch(() => ({}));
        const duration = body.duration as string;
        const resume = body.resume === true;

        if (!VALID_DURATIONS.includes(duration as DiscussionRightDuration)) {
            return NextResponse.json(
                { error: 'Durée invalide. Utilisez THREE_MONTHS, SIX_MONTHS ou TWELVE_MONTHS.' },
                { status: 400 }
            );
        }

        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: { members: true, rightPurchase: true },
        });

        if (!group) {
            return NextResponse.json({ error: 'Discussion non trouvée' }, { status: 404 });
        }

        const isMember = group.members.some((m) => m.userId === user.userId);
        if (!isMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        if (!group.isDirect || group.members.length !== 2) {
            return NextResponse.json(
                { error: "L'achat des droits est réservé aux discussions directes entre deux utilisateurs" },
                { status: 400 }
            );
        }

        const memberIds = group.members.map((m) => m.userId);
        const proSubs = await prisma.userProSubscription.findMany({
            where: { userId: { in: memberIds }, isActive: true },
            select: { userId: true, endDate: true },
        });
        const proUserIds = new Set(
            proSubs.filter((s) => isUserProActive(s.endDate)).map((s) => s.userId)
        );

        if (!proUserIds.has(user.userId)) {
            return NextResponse.json(
                { error: 'Seuls les comptes Pro peuvent acheter les droits d\'une discussion' },
                { status: 403 }
            );
        }

        const otherMember = group.members.find((m) => m.userId !== user.userId);
        if (!otherMember) {
            return NextResponse.json({ error: 'Membre invalide' }, { status: 400 });
        }

        if (!proUserIds.has(otherMember.userId)) {
            return NextResponse.json(
                { error: "L'achat des droits est réservé aux discussions entre deux comptes Pro" },
                { status: 400 }
            );
        }

        const existingRequest = group.rightPurchase;
        if (existingRequest) {
            const isActive = new Date() < existingRequest.expiresAt;
            if (isActive) {
                return NextResponse.json(
                    {
                        error: 'Les droits de cette discussion ont déjà été achetés.',
                        expiresAt: existingRequest.expiresAt,
                    },
                    { status: 400 }
                );
            }
        }

        const amountFcfa = getDiscussionRightPrice(duration as DiscussionRightDuration);
        const config = DISCUSSION_RIGHT_DURATIONS[duration as DiscussionRightDuration];

        const paymentModeSetting = await prisma.paymentSetting.findUnique({
            where: { key: 'subscription_payment_mode' },
        });
        const paymentMode = paymentModeSetting?.value || 'CINETPAY';

        if (paymentMode === 'MANUAL') {
            const existingManualOrder = await prisma.paymentOrder.findFirst({
                where: {
                    userId: user.userId,
                    type: 'DISCUSSION_RIGHTS',
                    groupId,
                    status: 'PENDING',
                },
            });
            if (existingManualOrder) {
                return NextResponse.json(
                    {
                        error: 'Une demande d\'achat est déjà en attente. Elle sera traitée par un administrateur.',
                        pendingOrderId: existingManualOrder.id,
                    },
                    { status: 409 }
                );
            }
            const dbUser = await prisma.user.findUnique({
                where: { id: user.userId },
                select: { name: true },
            });

            const order = await prisma.paymentOrder.create({
                data: {
                    userId: user.userId,
                    plan: duration,
                    name: dbUser?.name || 'Droits discussion',
                    type: 'DISCUSSION_RIGHTS',
                    groupId,
                    amountFcfa,
                    status: 'PENDING',
                },
            });

            try {
                await notifySuperAdminNewPaymentOrder({
                    orderId: order.id,
                    plan: duration,
                    name: dbUser?.name || 'Droits discussion',
                    amountFcfa,
                    type: 'DISCUSSION_RIGHTS',
                });
            } catch (notifErr) {
                console.error('[PurchaseRights] Notify super admin error:', notifErr);
            }

            return NextResponse.json({
                status: 'success',
                mode: 'MANUAL',
                message: 'Votre demande a été envoyée. Elle sera traitée par un administrateur.',
                orderId: order.id,
                duration,
                amount: amountFcfa,
            });
        }

        // Mode CINETPAY
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await prisma.pendingSubscriptionPayment.deleteMany({
            where: {
                userId: user.userId,
                type: 'DISCUSSION_RIGHTS',
                groupId,
                createdAt: { lt: cutoff },
            },
        });

        const existingPending = await prisma.pendingSubscriptionPayment.findFirst({
            where: {
                userId: user.userId,
                type: 'DISCUSSION_RIGHTS',
                groupId,
            },
        });
        if (existingPending && !resume) {
            return NextResponse.json(
                {
                    error: 'Un paiement est déjà en attente. Cliquez sur "Compléter le paiement" pour obtenir un nouveau lien.',
                    pendingPayment: { id: existingPending.id, plan: existingPending.plan },
                },
                { status: 409 }
            );
        }
        if (existingPending && resume) {
            await prisma.pendingSubscriptionPayment.deleteMany({
                where: {
                    userId: user.userId,
                    type: 'DISCUSSION_RIGHTS',
                    groupId,
                },
            });
        }

        const apikey = process.env.CINETPAY_API_KEY?.trim();
        const siteId = process.env.CINETPAY_SITE_ID?.trim();
        const notifyUrl = process.env.CINETPAY_NOTIFY_URL?.trim();
        const returnUrl = process.env.CINETPAY_RETURN_URL?.trim();

        if (!apikey || !siteId || !notifyUrl || !returnUrl) {
            return NextResponse.json(
                { error: 'Configuration CinetPay manquante.' },
                { status: 500 }
            );
        }

        const dbUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { name: true, email: true, phone: true },
        });

        const transactionId = `dr-${groupId.slice(-6)}-${user.userId.slice(-6)}-${Date.now()}`;

        await prisma.pendingSubscriptionPayment.create({
            data: {
                transactionId,
                userId: user.userId,
                plan: duration,
                name: dbUser?.name || 'Droits discussion',
                type: 'DISCUSSION_RIGHTS',
                groupId,
            },
        });

        const feeRate = 0.02;
        const amountWithFees = Math.round(amountFcfa * (1 + feeRate));
        const amount = Math.max(5, Math.round(amountWithFees / 5) * 5);

        const description = `Droits discussion ${config.label} - ${amount} FCFA`.replace(/[#/$_&]/g, ' ');
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
            metadata: JSON.stringify({
                plan: duration,
                userId: user.userId,
                type: 'DISCUSSION_RIGHTS',
                groupId,
                ref: transactionId,
            }),
            customer_name: (dbUser?.name || 'Client').split(/\s+/)[0] || 'Client',
            customer_surname: (dbUser?.name || ' ').split(/\s+/).slice(1).join(' ') || ' ',
            customer_email: dbUser?.email || `contact-${transactionId}@placeholder.local`,
            customer_phone_number: dbUser?.phone || '770000000',
            customer_address: 'Adresse non renseignée',
            customer_city: 'Abidjan',
            customer_country: defaultCountry.toUpperCase().slice(0, 2),
            customer_state: defaultCountry.toUpperCase().slice(0, 2),
            customer_zip_code: '00000',
        };

        const response = await fetch(CINETPAY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mango-App/1.0',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            await prisma.pendingSubscriptionPayment.deleteMany({ where: { transactionId } }).catch(() => {});
            return NextResponse.json(
                { error: data?.description || 'La demande de paiement a échoué' },
                { status: 502 }
            );
        }

        if (String(data?.code) !== '201' || !data?.data?.payment_url) {
            await prisma.pendingSubscriptionPayment.deleteMany({ where: { transactionId } }).catch(() => {});
            return NextResponse.json(
                { error: data?.description || 'Impossible de créer le lien de paiement.' },
                { status: 502 }
            );
        }

        return NextResponse.json({
            status: 'success',
            mode: 'CINETPAY',
            duration,
            baseAmount: amountFcfa,
            amountCharged: amount,
            transactionId,
            paymentUrl: data.data.payment_url,
        });
    } catch (error) {
        console.error('Purchase rights error:', error);
        return NextResponse.json(
            { error: "Erreur lors de l'achat des droits" },
            { status: 500 }
        );
    }
}
