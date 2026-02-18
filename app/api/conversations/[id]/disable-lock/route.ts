/**
 * POST: Désactiver le verrouillage (supprimer le code)
 * Autorisé : l'utilisateur qui a créé le code OU les deux si les deux sont Pro
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { isUserProActive } from '@/src/lib/user-pro';

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

        const { id } = await params;

        const group = await prisma.group.findUnique({
            where: { id },
            include: { members: true },
        });

        if (!group) {
            return NextResponse.json({ error: 'Conversation non trouvée' }, { status: 404 });
        }

        const isMember = group.members.some((m) => m.userId === user.userId);
        if (!isMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        if (!group.lockCodeHash) {
            return NextResponse.json(
                { error: 'Cette discussion n\'est pas verrouillée' },
                { status: 400 }
            );
        }

        const memberIds = group.members.map((m) => m.userId);
        const proSubs = await prisma.userProSubscription.findMany({
            where: { userId: { in: memberIds }, isActive: true },
            select: { userId: true, endDate: true },
        });
        const proUserIds = new Set(
            proSubs.filter((s) => isUserProActive(s.endDate)).map((s) => s.userId)
        );
        const bothPro = proUserIds.has(user.userId) && memberIds.every((mid) => proUserIds.has(mid));
        const isSetter = group.lockSetByUserId === user.userId;

        if (!isSetter && !bothPro) {
            return NextResponse.json(
                { error: 'Seul l\'utilisateur qui a créé le code ou les deux membres Pro peuvent désactiver le verrouillage' },
                { status: 403 }
            );
        }

        await prisma.group.update({
            where: { id },
            data: {
                lockCodeHash: null,
                lockSetByUserId: null,
                lockedAt: null,
            },
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Disable lock error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la désactivation' },
            { status: 500 }
        );
    }
}
