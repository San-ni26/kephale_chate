
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        // Vérifier que l'utilisateur existe en base (évite l'erreur de clé étrangère si le compte a été supprimé)
        const dbUser = await prisma.user.findUnique({
            where: { id: user.userId },
        });
        if (!dbUser) {
            return NextResponse.json({ error: 'Utilisateur introuvable. Veuillez vous reconnecter.' }, { status: 401 });
        }

        const body = await request.json();
        const { subscription, deviceName } = body || {};

        if (!subscription || !subscription.endpoint || typeof subscription.endpoint !== 'string') {
            return NextResponse.json({ error: 'Subscription non valide (endpoint manquant)' }, { status: 400 });
        }
        const keys = subscription.keys;
        if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
            return NextResponse.json({ error: 'Subscription non valide (clés p256dh/auth manquantes)' }, { status: 400 });
        }

        // Éviter les doublons : si cet utilisateur a déjà cet appareil (même endpoint), retourner succès
        const existing = await prisma.pushSubscription.findUnique({
            where: { endpoint: subscription.endpoint },
        });
        if (existing?.userId === user.userId) {
            return NextResponse.json({ success: true }, { status: 200 });
        }

        const deviceNameStr = typeof deviceName === 'string' && deviceName.trim() ? deviceName.trim() : null;

        // Créer ou mettre à jour (endpoint @unique : un seul enregistrement par appareil)
        await prisma.pushSubscription.upsert({
            where: { endpoint: subscription.endpoint },
            update: {
                userId: user.userId,
                p256dh: keys.p256dh,
                auth: keys.auth,
                deviceName: deviceNameStr,
            },
            create: {
                userId: user.userId,
                endpoint: subscription.endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                deviceName: deviceNameStr,
            },
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }
}
