import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

/**
 * DELETE /api/push/subscriptions/[id]
 * Supprime un appareil (push subscription) pour l'utilisateur connecté.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await authenticate(request as any);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: 'ID manquant' }, { status: 400 });
    }

    try {
        const sub = await prisma.pushSubscription.findFirst({
            where: { id, userId: user.userId },
        });

        if (!sub) {
            return NextResponse.json({ error: 'Appareil introuvable' }, { status: 404 });
        }

        await prisma.pushSubscription.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('[Push subscriptions DELETE] error:', e);
        return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
    }
}
