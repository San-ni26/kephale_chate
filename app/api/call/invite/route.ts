import { NextRequest, NextResponse } from 'next/server';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { emitToUser } from '@/src/lib/pusher-server';
import { prisma } from '@/src/lib/prisma';
import { decryptPII } from '@/src/lib/server-crypto';
import {
    getCallRoom,
    addParticipantToRoom,
    createRoomInvitation,
    getRoomByParticipant,
} from '@/src/lib/call-redis';

/**
 * POST /api/call/invite
 * Inviter un contact à rejoindre un appel en cours
 */
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const { roomId, inviteeId } = body;

        if (!roomId || !inviteeId) {
            return NextResponse.json(
                { error: 'Missing roomId or inviteeId' },
                { status: 400 }
            );
        }

        // Vérifier que la salle existe
        const room = await getCallRoom(roomId);
        if (!room) {
            return NextResponse.json(
                { error: 'Room not found' },
                { status: 404 }
            );
        }

        // Vérifier que l'appelant est le host ou un participant autorisé
        if (room.hostId !== user.userId) {
            return NextResponse.json(
                { error: 'Only host can invite participants' },
                { status: 403 }
            );
        }

        // Vérifier que l'invité n'est pas déjà dans la salle
        if (room.participants.includes(inviteeId)) {
            return NextResponse.json(
                { error: 'User already in room' },
                { status: 409 }
            );
        }

        // Vérifier que l'invité n'est pas déjà en attente
        if (room.pendingInvites.includes(inviteeId)) {
            return NextResponse.json(
                { error: 'Invitation already pending' },
                { status: 409 }
            );
        }

        // Récupérer le nom du host
        let hostName = 'Utilisateur';
        try {
            const host = await prisma.user.findUnique({
                where: { id: user.userId },
                select: { name: true, email: true },
            });
            if (host) {
                hostName = host.name || (host.email ? decryptPII(host.email) : undefined) || 'Utilisateur';
            }
        } catch (e) {
            console.error('Error fetching host name:', e);
        }

        // Créer l'invitation dans Redis
        const joinToken = await createRoomInvitation(
            roomId,
            inviteeId,
            user.userId,
            hostName,
            room.callType
        );

        if (!joinToken) {
            return NextResponse.json(
                { error: 'Failed to create invitation' },
                { status: 500 }
            );
        }

        // Ajouter aux invitations en attente de la salle
        room.pendingInvites.push(inviteeId);
        const { updateCallRoom } = await import('@/src/lib/call-redis');
        await updateCallRoom(room);

        // Envoyer la notification via Pusher (avec fallback si échec)
        try {
            await emitToUser(inviteeId, 'room:invitation', {
                roomId,
                hostId: user.userId,
                hostName,
                callType: room.callType,
                participantCount: room.participants.length,
                joinToken,
            });
        } catch (e) {
            console.warn('[Call] Failed to send invitation via Pusher:', e);
            // L'invitation est quand même enregistrée dans Redis
        }

        return NextResponse.json({
            success: true,
            roomId,
            joinToken,
        });
    } catch (error) {
        console.error('Call invite error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de l\'invitation' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/call/invite?roomId=xxx
 * Récupérer les invitations en attente pour une salle (host only)
 */
export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get('roomId');

        if (!roomId) {
            return NextResponse.json(
                { error: 'Missing roomId' },
                { status: 400 }
            );
        }

        const room = await getCallRoom(roomId);
        if (!room) {
            return NextResponse.json(
                { error: 'Room not found' },
                { status: 404 }
            );
        }

        if (room.hostId !== user.userId) {
            return NextResponse.json(
                { error: 'Only host can view invitations' },
                { status: 403 }
            );
        }

        return NextResponse.json({
            pendingInvites: room.pendingInvites,
            participants: room.participants,
        });
    } catch (error) {
        console.error('Call invite GET error:', error);
        return NextResponse.json(
            { error: 'Erreur' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/call/invite
 * Annuler une invitation
 */
export async function DELETE(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const { roomId, inviteeId } = body;

        if (!roomId || !inviteeId) {
            return NextResponse.json(
                { error: 'Missing roomId or inviteeId' },
                { status: 400 }
            );
        }

        const room = await getCallRoom(roomId);
        if (!room) {
            return NextResponse.json(
                { error: 'Room not found' },
                { status: 404 }
            );
        }

        if (room.hostId !== user.userId) {
            return NextResponse.json(
                { error: 'Only host can cancel invitations' },
                { status: 403 }
            );
        }

        // Retirer des invitations en attente
        room.pendingInvites = room.pendingInvites.filter(id => id !== inviteeId);
        const { updateCallRoom, clearRoomInvitation } = await import('@/src/lib/call-redis');
        await updateCallRoom(room);
        await clearRoomInvitation(inviteeId, roomId);

        // Notifier l'invité que l'invitation est annulée
        try {
            await emitToUser(inviteeId, 'room:invitation-cancelled', { roomId });
        } catch (e) {
            console.warn('[Call] Failed to notify invitation cancellation:', e);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Call invite DELETE error:', error);
        return NextResponse.json(
            { error: 'Erreur' },
            { status: 500 }
        );
    }
}
