/**
 * GET /api/user-pro/status
 * Retourne le statut de l'abonnement Pro et les paramètres
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { isUserProActive } from '@/src/lib/user-pro';

export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const [subscription, settings, pendingOrder, pendingPayment] = await Promise.all([
            prisma.userProSubscription.findUnique({
                where: { userId: user.userId },
            }),
            prisma.userProSettings.findUnique({
                where: { userId: user.userId },
            }),
            prisma.paymentOrder.findFirst({
                where: {
                    userId: user.userId,
                    type: 'USER_PRO',
                    status: 'PENDING',
                },
                select: { id: true, plan: true, amountFcfa: true, createdAt: true },
            }),
            prisma.pendingSubscriptionPayment.findFirst({
                where: {
                    userId: user.userId,
                    type: 'USER_PRO',
                },
                select: { id: true, plan: true, createdAt: true },
            }),
        ]);

        const isPro = !!subscription && isUserProActive(subscription.endDate);

        return NextResponse.json({
            isPro,
            subscription: subscription
                ? {
                    plan: subscription.plan,
                    startDate: subscription.startDate,
                    endDate: subscription.endDate,
                    isActive: subscription.isActive,
                }
                : null,
            settings: settings
                ? {
                    blurOldMessages: settings.blurOldMessages,
                    preventScreenshot: settings.preventScreenshot,
                }
                : {
                    blurOldMessages: true,
                    preventScreenshot: true,
                },
            pendingOrder: pendingOrder
                ? {
                    id: pendingOrder.id,
                    plan: pendingOrder.plan,
                    amountFcfa: pendingOrder.amountFcfa,
                    createdAt: pendingOrder.createdAt,
                }
                : null,
            pendingPayment: pendingPayment
                ? {
                    id: pendingPayment.id,
                    plan: pendingPayment.plan,
                    createdAt: pendingPayment.createdAt,
                }
                : null,
        });
    } catch (error: unknown) {
        console.error('User Pro status error:', error);
        const isTimeout = error instanceof Error && (
            error.message?.includes('ETIMEDOUT') ||
            error.message?.includes('timeout') ||
            (error as { code?: string }).code === 'ETIMEDOUT'
        );
        return NextResponse.json(
            {
                error: isTimeout
                    ? 'Connexion à la base de données expirée. Vérifiez que PostgreSQL est démarré et accessible.'
                    : 'Erreur lors de la récupération du statut',
            },
            { status: isTimeout ? 503 : 500 }
        );
    }
}
