import { NextRequest, NextResponse } from 'next/server';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { emitToUser } from '@/src/lib/pusher-server';
import { prisma } from '@/src/lib/prisma';
import { notifyIncomingCall } from '@/src/lib/websocket';
import { decryptPII } from '@/src/lib/server-crypto';
import {
    setUserInCall,
    setUserCallEnded,
    setPendingCall,
    clearPendingCall,
    createCallRoom,
    getCallRoom,
    addParticipantToRoom,
    removeParticipantFromRoom,
    getPendingCall,
} from '@/src/lib/call-redis';
import { resolveCollision, generateRoomId, isColliding } from '@/src/lib/collision-guard';

/**
 * POST /api/call/signal
 * Handles WebRTC call signaling via Pusher.
 * 
 * Supported events:
 * - call:invite   -> forwards offer to recipient + sends push notification
 * - call:answer   -> forwards answer to caller
 * - call:reject   -> notifies caller of rejection
 * - call:end      -> notifies target that call ended
 * - call:ice-candidate -> forwards ICE candidate to target
 * - call:ice-restart -> ICE restart for reconnection
 * - call:offer-to-peer -> Offer to a specific peer (multi-participant)
 * - call:answer-to-peer -> Answer from a specific peer (multi-participant)
 * - call:quality-changed -> Notify quality change to peer
 * - room:leave    -> Leave a room
 * - room:participant-left -> Notify when participant leaves
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
        const { event } = body;

        switch (event) {
            case 'call:invite': {
                const { recipientId, offer, conversationId, isVideo, timestamp = Date.now() } = body;
                if (!recipientId || !offer || !conversationId) {
                    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

                // Vérifier s'il y a une collision (le destinataire est déjà en train d'appeler l'expéditeur)
                const recipientPendingCall = await getPendingCall(user.userId);
                if (recipientPendingCall && recipientPendingCall.callerId === recipientId) {
                    // Collision détectée !
                    const resolution = resolveCollision(
                        user.userId,
                        recipientId,
                        timestamp,
                        recipientPendingCall.startedAt || Date.now()
                    );

                    if (resolution.action === 'merge') {
                        // Créer une room avec les deux participants
                        const roomId = resolution.roomId!;
                        const callType = isVideo !== false ? 'video' : 'audio';
                        
                        await createCallRoom(roomId, resolution.winner, callType, conversationId);
                        await addParticipantToRoom(roomId, resolution.winner);
                        await addParticipantToRoom(roomId, resolution.loser);

                        // Notifier le "perdant" que l'appel est fusionné
                        try {
                            await emitToUser(resolution.loser, 'collision:merged', {
                                roomId,
                                hostId: resolution.winner,
                                otherParticipant: { userId: resolution.winner },
                                callType,
                            });
                        } catch (e) {
                            console.warn('[Call] Failed to notify loser of collision:', e);
                        }

                        // Notifier le "gagnant" qu'il doit créer la room
                        try {
                            await emitToUser(resolution.winner, 'collision:resolved', {
                                roomId,
                                otherParticipant: { userId: resolution.loser },
                                callType,
                                isHost: true,
                            });
                        } catch (e) {
                            console.warn('[Call] Failed to notify winner of collision:', e);
                        }

                        return NextResponse.json({ 
                            success: true, 
                            collision: true,
                            roomId,
                            isHost: user.userId === resolution.winner,
                        });
                    }
                }

                // Fetch caller name
                let callerName = 'Utilisateur';
                try {
                    const caller = await prisma.user.findUnique({
                        where: { id: user.userId },
                        select: { name: true, email: true }
                    });
                    if (caller) {
                        callerName = caller.name || (caller.email ? decryptPII(caller.email) : undefined) || 'Utilisateur';
                    }
                } catch (e) {
                    console.error('Error fetching caller name:', e);
                }

                // Créer une room pour cet appel (même si 1-to-1 pour l'instant)
                const roomId = generateRoomId(user.userId, recipientId);
                const callType = isVideo !== false ? 'video' : 'audio';
                await createCallRoom(roomId, user.userId, callType, conversationId);

                const pendingData = {
                    callerId: user.userId,
                    callerName,
                    offer,
                    conversationId,
                    isVideo: isVideo !== false,
                    roomId,
                    startedAt: timestamp,
                };

                // Stocker appel en attente (Redis) pour destinataire offline
                await setPendingCall(recipientId, pendingData);

                // Marquer l'appelant comme en appel (Redis)
                await setUserInCall(user.userId, conversationId, recipientId);

                // Send via Pusher + Web Push (avec fallback si Pusher fail)
                try {
                    await notifyIncomingCall(recipientId, user.userId, callerName, offer, conversationId, pendingData.isVideo);
                } catch (e) {
                    console.warn('[Call] Pusher notification failed, but call is still pending:', e);
                    // L'appel est quand même enregistré dans Redis, l'utilisateur pourra voir l'appel en attente au rechargement
                }

                return NextResponse.json({ success: true, roomId });
            }

            case 'call:answer': {
                const { callerId, answer, conversationId } = body;
                if (!callerId || !answer) {
                    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

                // Supprimer l'appel en attente (répondant = user connecté) pour éviter réapplication
                await clearPendingCall(user.userId);

                // Marquer les deux comme en appel (Redis)
                const convId = conversationId || '';
                await setUserInCall(user.userId, convId, callerId);
                await setUserInCall(callerId, convId, user.userId);

                try {
                    await emitToUser(callerId, 'call:answered', {
                        answer,
                        responderId: user.userId,
                    });
                } catch (e) {
                    console.warn('[Call] Failed to notify caller of answer:', e);
                }

                return NextResponse.json({ success: true });
            }

            case 'call:reject': {
                const { callerId } = body;
                if (!callerId) {
                    return NextResponse.json({ error: 'Missing callerId' }, { status: 400 });
                }

                // Supprimer l'appel en attente (destinataire = user connecté)
                await clearPendingCall(user.userId);

                // Fin d'appel pour les deux (Redis)
                await setUserCallEnded(user.userId);
                await setUserCallEnded(callerId);

                try {
                    await emitToUser(callerId, 'call:rejected', {
                        responderId: user.userId,
                    });
                } catch (e) {
                    console.warn('[Call] Failed to notify caller of rejection:', e);
                }

                return NextResponse.json({ success: true });
            }

            case 'call:end': {
                const { targetUserId, roomId } = body;
                if (!targetUserId && !roomId) {
                    return NextResponse.json({ error: 'Missing targetUserId or roomId' }, { status: 400 });
                }

                // Si roomId est fourni, gérer la sortie de room
                if (roomId) {
                    const room = await getCallRoom(roomId);
                    if (room) {
                        const result = await removeParticipantFromRoom(roomId, user.userId);
                        
                        // Notifier les autres participants
                        for (const participantId of room.participants) {
                            if (participantId !== user.userId) {
                                try {
                                    await emitToUser(participantId, 'room:participant-left', {
                                        roomId,
                                        userId: user.userId,
                                        newHostId: result.newHostId,
                                        shouldEnd: result.shouldEnd,
                                    });
                                } catch (e) {
                                    console.warn(`[Call] Failed to notify ${participantId} of participant leaving:`, e);
                                }
                            }
                        }

                        if (result.shouldEnd) {
                            return NextResponse.json({ success: true, roomEnded: true });
                        }
                    }
                    return NextResponse.json({ success: true });
                }

                // Mode 1-to-1 legacy
                // Supprimer l'appel en attente du destinataire (si l'appelant raccroche avant reponse)
                await clearPendingCall(targetUserId);

                // Fin d'appel pour les deux (Redis)
                await setUserCallEnded(user.userId);
                await setUserCallEnded(targetUserId);

                try {
                    await emitToUser(targetUserId, 'call:ended', {
                        enderId: user.userId,
                    });
                } catch (e) {
                    console.warn('[Call] Failed to notify target of call end:', e);
                }

                return NextResponse.json({ success: true });
            }

            case 'call:ice-candidate': {
                const { targetUserId, candidate } = body;
                if (!targetUserId || !candidate) {
                    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

                try {
                    await emitToUser(targetUserId, 'call:ice-candidate', {
                        candidate,
                        senderId: user.userId,
                    });
                } catch (e) {
                    console.warn('[Call] Failed to send ICE candidate:', e);
                }

                return NextResponse.json({ success: true });
            }

            case 'call:ice-restart': {
                const { targetUserId, offer } = body;
                if (!targetUserId || !offer) {
                    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

                try {
                    await emitToUser(targetUserId, 'call:ice-restart', {
                        offer,
                        senderId: user.userId,
                    });
                } catch (e) {
                    console.warn('[Call] Failed to send ICE restart:', e);
                }

                return NextResponse.json({ success: true });
            }

            case 'call:offer-to-peer': {
                // Nouvel événement pour multi-peer : offer d'un participant à un autre
                const { targetUserId, roomId, offer } = body;
                if (!targetUserId || !roomId || !offer) {
                    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

                // Vérifier que l'émetteur est dans la room
                const room = await getCallRoom(roomId);
                if (!room || !room.participants.includes(user.userId)) {
                    return NextResponse.json({ error: 'Not in room' }, { status: 403 });
                }

                try {
                    await emitToUser(targetUserId, 'call:offer-from-peer', {
                        offer,
                        senderId: user.userId,
                        roomId,
                    });
                } catch (e) {
                    console.warn('[Call] Failed to send offer to peer:', e);
                }

                return NextResponse.json({ success: true });
            }

            case 'call:answer-to-peer': {
                // Réponse à une offer d'un peer
                const { targetUserId, roomId, answer } = body;
                if (!targetUserId || !roomId || !answer) {
                    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

                const room = await getCallRoom(roomId);
                if (!room || !room.participants.includes(user.userId)) {
                    return NextResponse.json({ error: 'Not in room' }, { status: 403 });
                }

                try {
                    await emitToUser(targetUserId, 'call:answer-from-peer', {
                        answer,
                        senderId: user.userId,
                        roomId,
                    });
                } catch (e) {
                    console.warn('[Call] Failed to send answer to peer:', e);
                }

                return NextResponse.json({ success: true });
            }

            case 'call:quality-changed': {
                // Notifier un changement de qualité vidéo
                const { targetUserId, quality, roomId } = body;
                if (!targetUserId || !quality) {
                    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

                try {
                    await emitToUser(targetUserId, 'call:quality-changed', {
                        quality,
                        senderId: user.userId,
                        roomId,
                    });
                } catch (e) {
                    console.warn('[Call] Failed to send quality change:', e);
                }

                return NextResponse.json({ success: true });
            }

            case 'room:leave': {
                // Quitter une room proprement
                const { roomId } = body;
                if (!roomId) {
                    return NextResponse.json({ error: 'Missing roomId' }, { status: 400 });
                }

                const room = await getCallRoom(roomId);
                if (room) {
                    const result = await removeParticipantFromRoom(roomId, user.userId);
                    
                    // Notifier les autres
                    for (const participantId of room.participants) {
                        if (participantId !== user.userId) {
                            try {
                                await emitToUser(participantId, 'room:participant-left', {
                                    roomId,
                                    userId: user.userId,
                                    newHostId: result.newHostId,
                                    shouldEnd: result.shouldEnd,
                                });
                            } catch (e) {
                                console.warn(`[Call] Failed to notify ${participantId} of participant leaving:`, e);
                            }
                        }
                    }
                }

                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
        }
    } catch (error) {
        console.error('Call signal error:', error);
        return NextResponse.json({ error: 'Erreur de signalisation' }, { status: 500 });
    }
}
