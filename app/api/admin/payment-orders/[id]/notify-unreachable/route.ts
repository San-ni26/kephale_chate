/**
 * API admin - Envoyer un email "numéro injoignable" à l'utilisateur d'un ordre de paiement
 * POST: Envoie l'email pour informer que le numéro est injoignable par appel et WhatsApp
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireAdmin } from '@/src/middleware/auth';
import { sendUnreachablePhoneNotificationEmail } from '@/src/lib/email';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const order = await prisma.paymentOrder.findUnique({
            where: { id },
        });

        if (!order) {
            return NextResponse.json({ error: 'Ordre non trouvé' }, { status: 404 });
        }

        const user = await prisma.user.findUnique({
            where: { id: order.userId },
            select: { email: true, name: true, phone: true },
        });
        if (!user?.email) {
            return NextResponse.json({ error: 'Utilisateur sans email' }, { status: 400 });
        }

        const sent = await sendUnreachablePhoneNotificationEmail(
            user.email,
            user.name,
            user.phone
        );

        if (!sent) {
            return NextResponse.json({ error: 'Échec de l\'envoi de l\'email' }, { status: 500 });
        }

        return NextResponse.json({ message: 'Email envoyé avec succès' });
    } catch (error) {
        console.error('Notify unreachable error:', error);
        return NextResponse.json({ error: 'Erreur lors de l\'envoi' }, { status: 500 });
    }
}
