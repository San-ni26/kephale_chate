/**
 * /api/admin/notifications
 * DELETE avec ?unreadOnly=1 ou ?all=1 : supprime les notifications (admin uniquement).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireAdmin } from '@/src/middleware/auth';

export async function GET() {
    return NextResponse.json({ error: 'Méthode non autorisée. Utilisez DELETE avec ?unreadOnly=1 ou ?all=1' }, { status: 405 });
}

export async function DELETE(request: NextRequest) {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === '1';
    const all = searchParams.get('all') === '1';

    if (!unreadOnly && !all) {
        return NextResponse.json(
            { error: 'Ajoutez ?unreadOnly=1 (notifications non lues) ou ?all=1 (toutes)' },
            { status: 400 }
        );
    }

    try {
        const where = unreadOnly ? { isRead: false } : {};
        const result = await prisma.notification.deleteMany({ where });
        return NextResponse.json({
            deleted: result.count,
            message: unreadOnly
                ? `${result.count} notification(s) non lue(s) supprimée(s)`
                : `${result.count} notification(s) supprimée(s)`,
        });
    } catch (error) {
        console.error('Admin delete notifications error:', error);
        return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
    }
}
