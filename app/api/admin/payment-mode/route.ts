/**
 * API mode de paiement (admin Kephale)
 * GET: Récupérer le mode actif (CINETPAY | MANUAL)
 * PATCH: Changer le mode (ADMIN ou SUPER_ADMIN)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireAdmin, AuthenticatedRequest } from '@/src/middleware/auth';

const PAYMENT_MODE_KEY = 'subscription_payment_mode';

export async function GET() {
    try {
        const setting = await prisma.paymentSetting.findUnique({
            where: { key: PAYMENT_MODE_KEY },
        });

        const mode = setting?.value || 'CINETPAY';
        return NextResponse.json({ mode });
    } catch (error) {
        console.error('Get payment mode error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { mode } = body;

        if (!['CINETPAY', 'MANUAL'].includes(mode)) {
            return NextResponse.json({ error: 'Mode invalide. Utilisez CINETPAY ou MANUAL.' }, { status: 400 });
        }

        await prisma.paymentSetting.upsert({
            where: { key: PAYMENT_MODE_KEY },
            create: { key: PAYMENT_MODE_KEY, value: mode },
            update: { value: mode },
        });

        return NextResponse.json({ mode });
    } catch (error) {
        console.error('Update payment mode error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}
