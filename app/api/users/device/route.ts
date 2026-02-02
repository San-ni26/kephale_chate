import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

import { Prisma } from '@/src/prisma/client';

// POST: Reset device (allows login from new device)
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        // Clear device info to allow login from new device
        await prisma.user.update({
            where: { id: user.userId },
            data: {
                deviceId: null,
                deviceInfo: Prisma.DbNull,
                isFirstLogin: true,
                isOnline: false,
            },
        });

        return NextResponse.json(
            {
                message: 'Appareil réinitialisé avec succès. Vous pouvez maintenant vous connecter depuis un nouvel appareil.',
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('Reset device error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la réinitialisation de l\'appareil' },
            { status: 500 }
        );
    }
}
