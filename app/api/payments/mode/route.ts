/**
 * GET /api/payments/mode
 * Retourne le mode de paiement actif (CINETPAY | MANUAL) pour les abonnements.
 * Accessible à tout utilisateur authentifié.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate } from '@/src/middleware/auth';

export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;

    try {
        const setting = await prisma.paymentSetting.findUnique({
            where: { key: 'subscription_payment_mode' },
        });

        const mode = setting?.value || 'CINETPAY';
        return NextResponse.json({ mode });
    } catch (error) {
        console.error('Get payment mode error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}
