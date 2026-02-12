/**
 * API des ordres de paiement (mode manuel)
 * POST: Créer un ordre
 * GET: Liste des ordres de l'utilisateur connecté
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';
import { SUBSCRIPTION_PLANS } from '@/src/lib/subscription';

const createOrderSchema = z.object({
    plan: z.enum(['BASIC', 'PROFESSIONAL', 'ENTERPRISE']),
    name: z.string().min(2),
    logo: z.string().optional(),
    address: z.string().optional(),
    requestId: z.string().optional(),
});

export async function POST(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const parsed = createOrderSchema.parse(body);

        const config = SUBSCRIPTION_PLANS[parsed.plan];
        const amountFcfa = config?.price ?? 0;

        if (amountFcfa <= 0) {
            return NextResponse.json({ error: 'Plan invalide' }, { status: 400 });
        }

        const order = await prisma.paymentOrder.create({
            data: {
                userId: user.userId,
                plan: parsed.plan,
                name: parsed.name,
                logo: parsed.logo || null,
                address: parsed.address?.trim() || null,
                requestId: parsed.requestId || null,
                amountFcfa,
                status: 'PENDING',
            },
        });

        return NextResponse.json({ order }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Create payment order error:', error);
        return NextResponse.json({ error: 'Erreur lors de la création de l\'ordre' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    try {
        const orders = await prisma.paymentOrder.findMany({
            where: { userId: user.userId },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ orders });
    } catch (error) {
        console.error('Get payment orders error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}
