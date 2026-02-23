/**
 * POST: Masquer la discussion pour l'autre utilisateur
 * Seul le Pro (ou le propriétaire des droits) peut masquer.
 * Quand masqué, l'autre voit les messages floutés.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { canUserHideDiscussion } from '@/src/lib/discussion-rights';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: groupId } = await params;

        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: { members: true },
        });

        if (!group) {
            return NextResponse.json({ error: 'Discussion non trouvée' }, { status: 404 });
        }

        const isMember = group.members.some((m) => m.userId === user.userId);
        if (!isMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        if (!group.isDirect || group.members.length !== 2) {
            return NextResponse.json(
                { error: 'Le masquage est réservé aux discussions directes' },
                { status: 400 }
            );
        }

        const canHide = await canUserHideDiscussion(groupId, user.userId);
        if (!canHide) {
            return NextResponse.json(
                {
                    error:
                        "Seul le compte Pro (ou le propriétaire des droits) peut masquer cette discussion.",
                },
                { status: 403 }
            );
        }

        await prisma.group.update({
            where: { id: groupId },
            data: { hiddenByUserId: user.userId },
        });

        return NextResponse.json(
            {
                success: true,
                message:
                    'Discussion masquée. L\'autre utilisateur verra les messages floutés.',
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Hide discussion error:', error);
        return NextResponse.json(
            { error: 'Erreur lors du masquage' },
            { status: 500 }
        );
    }
}
