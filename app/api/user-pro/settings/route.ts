/**
 * GET /api/user-pro/settings - Récupérer les paramètres Pro
 * PATCH /api/user-pro/settings - Mettre à jour les paramètres Pro (blur, screenshot)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

const patchSchema = z.object({
    blurOldMessages: z.boolean().optional(),
    preventScreenshot: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const settings = await prisma.userProSettings.findUnique({
            where: { userId: user.userId },
        });

        return NextResponse.json({
            blurOldMessages: settings?.blurOldMessages ?? true,
            preventScreenshot: settings?.preventScreenshot ?? true,
        });
    } catch (error) {
        console.error('User Pro settings GET error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération' },
            { status: 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        // Vérifier que l'utilisateur a un abonnement Pro actif
        const subscription = await prisma.userProSubscription.findUnique({
            where: { userId: user.userId },
        });
        if (!subscription || subscription.endDate < new Date()) {
            return NextResponse.json(
                { error: 'Abonnement Pro requis pour modifier ces paramètres' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const parsed = patchSchema.parse(body);

        const settings = await prisma.userProSettings.upsert({
            where: { userId: user.userId },
            create: {
                userId: user.userId,
                blurOldMessages: parsed.blurOldMessages ?? true,
                preventScreenshot: parsed.preventScreenshot ?? true,
            },
            update: {
                ...(parsed.blurOldMessages !== undefined && { blurOldMessages: parsed.blurOldMessages }),
                ...(parsed.preventScreenshot !== undefined && { preventScreenshot: parsed.preventScreenshot }),
            },
        });

        return NextResponse.json({
            blurOldMessages: settings.blurOldMessages,
            preventScreenshot: settings.preventScreenshot,
        });
    } catch (error) {
        console.error('User Pro settings PATCH error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour' },
            { status: 500 }
        );
    }
}
