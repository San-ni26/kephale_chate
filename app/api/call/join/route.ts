import { NextRequest, NextResponse } from 'next/server';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { emitToUser } from '@/src/lib/pusher-server';
import { prisma } from '@/src/lib/prisma';
import { decryptPII } from '@/src/lib/server-crypto';
import {
    getCallRoom,
    addParticipantToRoom,
    validateRoomInvitation,
    clearRoomInvitation,
    getRoomByParticipant,
} from '@/src/lib/call-redis';

/**
 * POST /api/call/join
 * Rejoindre un appel existant via invitation ou roomId direct
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
        const { roomId, joinToken } = body;

        if (!roomId) {
            return NextResponse.json(
                { error: 'Missing roomId' },
                { status: 400 }
            );
        }

        // Vérifier si l'utilisateur est déjà dans une salle
        const existingRoom = await getRoomByParticipant(user.userId);
        if (existingRoom && existingRoom.roomId !== roomId) {
            return NextResponse.json(
                { error: 'Already in another call' },
                { status: 409 }
            );
        }

        // Récupérer la salle
        const room = await getCallRoom(roomId);
        if (!room) {
            return NextResponse.json(
                { error: 'Room not found or ended' },
                { status: 404 }
            );
        }

        // Vérifier si l'utilisateur est déjà dans la salle
        if (room.participants.includes(user.userId)) {
            return NextResponse.json({
                success: true,
                room,
                existingParticipants: room.participants.filter(id => id !== user.userId),
                isHost: room.hostId === user.userId,
                alreadyJoined: true,
            });
        }

        // Vérifier l'autorisation (invitation ou token)
        const isInvited = room.pendingInvites.includes(user.userId);
        const hasValidToken = joinToken && await validateRoomInvitation(user.userId, roomId, joinToken);

        if (!isInvited && !hasValidToken && room.hostId !== user.userId) {
            return NextResponse.json(
                { error: 'Not authorized to join this room' },
                { status: 403 }
            );
        }

        // Ajouter le participant à la salle
        const added = await addParticipantToRoom(roomId, user.userId);
        if (!added) {
            return NextResponse.json(
                { error: 'Failed to join room' },
                { status: 500 }
            );
        }

        // Nettoyer l'invitation si elle existait
        if (isInvited || hasValidToken) {
            await clearRoomInvitation(user.userId, roomId);
        }

        // Récupérer les infos des participants existants
        const existingParticipants = await Promise.all(
            room.participants
                .filter(id => id !== user.userId)
                .map(async (participantId) => {
                    try {
                        const participant = await prisma.user.findUnique({
                            where: { id: participantId },
                            select: { id: true, name: true, email: true },
                        });
                        return {
                            userId: participantId,
                            userName: participant?.name ||
                                (participant?.email ? decryptPII(participant.email) : undefined) ||
                                'Utilisateur',
                        };
                    } catch {
                        return {
                            userId: participantId,
                            userName: 'Utilisateur',
                        };
                    }
                })
        );

        // Récupérer le nom du nouvel arrivant
        let joinerName = 'Utilisateur';
        try {
            const joiner = await prisma.user.findUnique({
                where: { id: user.userId },
                select: { name: true, email: true },
            });
            if (joiner) {
                joinerName = joiner.name ||
                    (joiner.email ? decryptPII(joiner.email) : undefined) ||
                    'Utilisateur';
            }
        } catch (e) {
            console.error('Error fetching joiner name:', e);
        }

        // Notifier tous les participants existants
        for (const participantId of room.participants) {
            if (participantId !== user.userId) {
                try {
                    await emitToUser(participantId, 'room:participant-joined', {
                        roomId,
                        userId: user.userId,
                        userName: joinerName,
                        participantCount: room.participants.length + 1,
                        isGroupCall: room.participants.length >= 2,
                    });
                } catch (e) {
                    console.warn(`[Call] Failed to notify ${participantId} of new participant:`, e);
                }
            }
        }

        // Récupérer la salle mise à jour
        const updatedRoom = await getCallRoom(roomId);

        return NextResponse.json({
            success: true,
            room: updatedRoom,
            existingParticipants,
            isHost: updatedRoom?.hostId === user.userId,
        });
    } catch (error) {
        console.error('Call join error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la connexion' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/call/join/validate?roomId=xxx&token=yyy
 * Valider si un utilisateur peut rejoindre une salle (sans la rejoindre)
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
        const token = searchParams.get('token');

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

        // Vérifier si déjà dans la salle
        if (room.participants.includes(user.userId)) {
            return NextResponse.json({
                canJoin: true,
                alreadyJoined: true,
                room: {
                    roomId: room.roomId,
                    hostId: room.hostId,
                    callType: room.callType,
                    participantCount: room.participants.length,
                },
            });
        }

        // Vérifier les autorisations
        const isInvited = room.pendingInvites.includes(user.userId);
        const hasValidToken = token && await validateRoomInvitation(user.userId, roomId, token);

        const canJoin = isInvited || hasValidToken || room.hostId === user.userId;

        return NextResponse.json({
            canJoin,
            isInvited,
            hasValidToken,
            room: canJoin ? {
                roomId: room.roomId,
                hostId: room.hostId,
                callType: room.callType,
                participantCount: room.participants.length,
            } : undefined,
        });
    } catch (error) {
        console.error('Call join validate error:', error);
        return NextResponse.json(
            { error: 'Erreur' },
            { status: 500 }
        );
    }
}
