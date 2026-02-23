/**
 * POST: Afficher la discussion (annuler le masquage)
 * Seul celui qui a masqué peut afficher à nouveau.
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

        if (!group.hiddenByUserId) {
            return NextResponse.json(
                { error: 'Cette discussion n\'est pas masquée' },
                { status: 400 }
            );
        }

        // Seul celui qui a le contrôle (et a masqué) peut afficher
        const canControl = await canUserHideDiscussion(groupId, user.userId);
        if (!canControl || group.hiddenByUserId !== user.userId) {
            return NextResponse.json(
                {
                    error:
                        "Seul l'utilisateur qui a masqué la discussion peut l'afficher à nouveau.",
                },
                { status: 403 }
            );
        }

        await prisma.group.update({
            where: { id: groupId },
            data: { hiddenByUserId: null },
        });

        return NextResponse.json(
            {
                success: true,
                message: 'Discussion affichée. Les messages sont à nouveau visibles.',
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Unhide discussion error:', error);
        return NextResponse.json(
            { error: "Erreur lors de l'affichage" },
            { status: 500 }
        );
    }
}
