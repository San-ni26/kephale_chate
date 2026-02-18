/**
 * POST: Refuser une demande de suppression de discussion (Pro/Pro)
 * L'autre utilisateur Pro peut refuser la demande.
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
            include: {
                requester: {
                    select: { id: true, name: true },
                },
            },
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

        // Seul l'autre utilisateur (celui qui n'a pas demandé) peut refuser
        if (deletionRequest.requestedBy === user.userId) {
            return NextResponse.json(
                { error: 'Pour annuler votre demande, ouvrez la discussion et attendez.' },
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

        if (!proUserIds.has(user.userId)) {
            return NextResponse.json(
                { error: 'Action non autorisée' },
                { status: 403 }
            );
        }

        await prisma.conversationDeletionRequest.delete({
            where: { groupId: conversationId },
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Reject deletion error:', error);
        return NextResponse.json(
            { error: 'Erreur lors du refus' },
            { status: 500 }
        );
    }
}
