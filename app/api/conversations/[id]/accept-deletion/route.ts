/**
 * POST: Accepter une demande de suppression de discussion (Pro/Pro)
 * Seul l'autre utilisateur Pro peut accepter.
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

        const conversationId = params.id;

        const deletionRequest = await prisma.conversationDeletionRequest.findUnique({
            where: { groupId: conversationId },
        });

        if (!deletionRequest) {
            return NextResponse.json(
                { error: 'Aucune demande de suppression en attente' },
                { status: 404 }
            );
        }

        const group = await prisma.group.findUnique({
            where: { id: conversationId },
            include: { members: true },
        });

        if (!group || !group.isDirect || group.members.length !== 2) {
            return NextResponse.json(
                { error: 'Conversation non trouvée ou invalide' },
                { status: 404 }
            );
        }

        const isMember = group.members.some((m) => m.userId === user.userId);
        if (!isMember) {
            return NextResponse.json(
                { error: 'Accès refusé' },
                { status: 403 }
            );
        }

        // Seul l'autre utilisateur (celui qui n'a pas demandé) peut accepter
        if (deletionRequest.requestedBy === user.userId) {
            return NextResponse.json(
                { error: 'Vous ne pouvez pas accepter votre propre demande. Attendez que l\'autre utilisateur accepte.' },
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

        if (!proUserIds.has(user.userId) || !proUserIds.has(deletionRequest.requestedBy)) {
            return NextResponse.json(
                { error: 'Seuls les deux membres Pro peuvent effectuer cette action' },
                { status: 403 }
            );
        }

        await prisma.$transaction([
            prisma.conversationDeletionRequest.delete({
                where: { groupId: conversationId },
            }),
            prisma.group.delete({
                where: { id: conversationId },
            }),
        ]);

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Accept deletion error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de l\'acceptation' },
            { status: 500 }
        );
    }
}
