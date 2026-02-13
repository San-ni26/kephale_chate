/**
 * /api/admin/push-subscriptions
 * DELETE avec ?all=1 : supprime tous les abonnements Push (admin uniquement).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireAdmin } from '@/src/middleware/auth';

export async function GET() {
    return NextResponse.json({ error: 'Méthode non autorisée. Utilisez DELETE avec ?all=1' }, { status: 405 });
}

export async function DELETE(request: NextRequest) {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all') === '1';

    if (!all) {
        return NextResponse.json(
            { error: 'Ajoutez ?all=1 pour confirmer la suppression de tous les abonnements push' },
            { status: 400 }
        );
    }

    try {
        const result = await prisma.pushSubscription.deleteMany({});
        return NextResponse.json({
            deleted: result.count,
            message: `${result.count} abonnement(s) push supprimé(s)`,
        });
    } catch (error) {
        console.error('Admin delete push subscriptions error:', error);
        return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
    }
}
