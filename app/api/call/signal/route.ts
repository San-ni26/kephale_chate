import { NextRequest, NextResponse } from 'next/server';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { emitToUser } from '@/src/lib/pusher-server';
import { prisma } from '@/src/lib/prisma';
import { notifyIncomingCall } from '@/src/lib/websocket';
import {
    setUserInCall,
    setUserCallEnded,
    setPendingCall,
    clearPendingCall,
} from '@/src/lib/call-redis';

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
                const { recipientId, offer, conversationId, callType } = body;
                if (!recipientId || !offer || !conversationId) {
                    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

                // Fetch caller name
                let callerName = 'Utilisateur';
                try {
                    const caller = await prisma.user.findUnique({
                        where: { id: user.userId },
                        select: { name: true, email: true }
                    });
                    if (caller) {
                        callerName = caller.name || caller.email;
                    }
                } catch (e) {
                    console.error('Error fetching caller name:', e);
                }

                const pendingData = {
                    callerId: user.userId,
                    callerName,
                    offer,
                    conversationId,
                    callType: (callType === 'video' ? 'video' : 'audio') as 'audio' | 'video',
                };

                // Stocker appel en attente (Redis) pour destinataire offline
                await setPendingCall(recipientId, pendingData);

                // Marquer l'appelant comme en appel (Redis)
                await setUserInCall(user.userId, conversationId, recipientId);

                // Send via Pusher + Web Push
                await notifyIncomingCall(recipientId, user.userId, callerName, offer, conversationId, pendingData.callType);

                return NextResponse.json({ success: true });
            }

            case 'call:answer': {
                const { callerId, answer, conversationId } = body;
                if (!callerId || !answer) {
                    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

                // Marquer les deux comme en appel (Redis)
                const convId = conversationId || '';
                await setUserInCall(user.userId, convId, callerId);
                await setUserInCall(callerId, convId, user.userId);

                await emitToUser(callerId, 'call:answered', {
                    answer,
                    responderId: user.userId,
                });

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

                await emitToUser(callerId, 'call:rejected', {
                    responderId: user.userId,
                });

                return NextResponse.json({ success: true });
            }

            case 'call:end': {
                const { targetUserId } = body;
                if (!targetUserId) {
                    return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 });
                }

                // Fin d'appel pour les deux (Redis)
                await setUserCallEnded(user.userId);
                await setUserCallEnded(targetUserId);

                await emitToUser(targetUserId, 'call:ended', {
                    enderId: user.userId,
                });

                return NextResponse.json({ success: true });
            }

            case 'call:ice-candidate': {
                const { targetUserId, candidate } = body;
                if (!targetUserId || !candidate) {
                    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

                await emitToUser(targetUserId, 'call:ice-candidate', {
                    candidate,
                    senderId: user.userId,
                });

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
