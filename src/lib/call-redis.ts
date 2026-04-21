/**
 * État des appels dans Redis
 * Compatible Vercel - Upstash Redis
 */

import { getRedis } from './redis';

const CALL_PREFIX = 'call:user:';
const PENDING_PREFIX = 'call:pending:';
const ROOM_PREFIX = 'call:room:';
const ROOM_INVITE_PREFIX = 'call:invite:';
const TTL_ACTIVE = 300; // 5 min max en appel
const TTL_PENDING = 120; // Appel en attente 2 min
const TTL_ROOM = 7200; // 2h pour une salle
const TTL_INVITE = 600; // 10 min pour une invitation

export interface CallState {
    conversationId: string;
    withUserId: string;
    startedAt: number;
}

export interface PendingCall {
    callerId: string;
    callerName: string;
    offer: unknown;
    conversationId: string;
    isVideo?: boolean;
    roomId?: string;
    startedAt?: number;
}

export interface CallRoom {
    roomId: string;
    hostId: string;
    participants: string[];
    pendingInvites: string[];
    callType: 'video' | 'audio';
    startedAt: number;
    isGroup: boolean;
    conversationId?: string;
}

export interface RoomInvitation {
    roomId: string;
    hostId: string;
    hostName: string;
    callType: 'video' | 'audio';
    invitedAt: number;
    joinToken: string;
}

/**
 * Marquer un utilisateur comme "en appel"
 */
export async function setUserInCall(
    userId: string,
    conversationId: string,
    withUserId: string
): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        const key = `${CALL_PREFIX}${userId}`;
        const data: CallState = { conversationId, withUserId, startedAt: Date.now() };
        await redis.set(key, JSON.stringify(data), { ex: TTL_ACTIVE });
        return true;
    } catch (err) {
        console.error('[Call] setUserInCall error:', err);
        return false;
    }
}

/**
 * Marquer la fin d'appel pour un utilisateur
 */
export async function setUserCallEnded(userId: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        await redis.del(`${CALL_PREFIX}${userId}`);
        return true;
    } catch (err) {
        console.error('[Call] setUserCallEnded error:', err);
        return false;
    }
}

/**
 * Vérifier si un utilisateur est en appel
 */
export async function isUserInCall(userId: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        const data = await redis.get(`${CALL_PREFIX}${userId}`);
        return !!data;
    } catch {
        return false;
    }
}

/**
 * Obtenir l'état d'appel d'un utilisateur
 */
export async function getCallState(userId: string): Promise<CallState | null> {
    const result = await getUsersInCall([userId]);
    return result[userId] ?? null;
}

/**
 * Obtenir l'état d'appel de plusieurs utilisateurs
 */
export async function getUsersInCall(userIds: string[]): Promise<Record<string, CallState | null>> {
    const redis = getRedis();
    const result: Record<string, CallState | null> = {};

    if (!redis || userIds.length === 0) {
        userIds.forEach(id => { result[id] = null; });
        return result;
    }

    try {
        const pipeline = redis.pipeline();
        userIds.forEach(id => pipeline.get(`${CALL_PREFIX}${id}`));
        const replies = (await pipeline.exec()) as (string | null)[];

        userIds.forEach((id, i) => {
            const data = replies[i];
            if (!data) {
                result[id] = null;
                return;
            }
            try {
                result[id] = typeof data === 'string' ? (JSON.parse(data) as CallState) : (data as CallState);
            } catch {
                result[id] = null;
            }
        });
    } catch (err) {
        console.error('[Call] getUsersInCall error:', err);
        userIds.forEach(id => { result[id] = null; });
    }

    return result;
}

/**
 * Stocker un appel en attente (destinataire offline)
 */
export async function setPendingCall(
    recipientId: string,
    data: PendingCall
): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        const key = `${PENDING_PREFIX}${recipientId}`;
        await redis.set(key, JSON.stringify(data), { ex: TTL_PENDING });
        return true;
    } catch (err) {
        console.error('[Call] setPendingCall error:', err);
        return false;
    }
}

/**
 * Récupérer un appel en attente (sans supprimer)
 */
export async function getPendingCall(recipientId: string): Promise<PendingCall | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
        const key = `${PENDING_PREFIX}${recipientId}`;
        const data = await redis.get(key);
        return data ? (typeof data === 'string' ? JSON.parse(data) : data) as PendingCall : null;
    } catch (err) {
        console.error('[Call] getPendingCall error:', err);
        return null;
    }
}

/**
 * Supprimer un appel en attente (ex: après rejet)
 */
export async function clearPendingCall(recipientId: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        await redis.del(`${PENDING_PREFIX}${recipientId}`);
        return true;
    } catch (err) {
        console.error('[Call] clearPendingCall error:', err);
        return false;
    }
}

/**
 * Récupérer et supprimer un appel en attente
 */
export async function getAndClearPendingCall(recipientId: string): Promise<PendingCall | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
        const key = `${PENDING_PREFIX}${recipientId}`;
        const data = await redis.get(key);
        if (data) {
            await redis.del(key);
            return (typeof data === 'string' ? JSON.parse(data) : data) as PendingCall;
        }
        return null;
    } catch (err) {
        console.error('[Call] getAndClearPendingCall error:', err);
        return null;
    }
}

// ============================================================================
// GESTION DES SALLES D'APPEL (MULTI-PARTICIPANTS)
// ============================================================================

/**
 * Créer une nouvelle salle d'appel
 */
export async function createCallRoom(
    roomId: string,
    hostId: string,
    callType: 'video' | 'audio',
    conversationId?: string
): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        const room: CallRoom = {
            roomId,
            hostId,
            participants: [hostId],
            pendingInvites: [],
            callType,
            startedAt: Date.now(),
            isGroup: false,
            conversationId,
        };
        await redis.set(`${ROOM_PREFIX}${roomId}`, JSON.stringify(room), { ex: TTL_ROOM });
        return true;
    } catch (err) {
        console.error('[Call] createCallRoom error:', err);
        return false;
    }
}

/**
 * Récupérer une salle d'appel
 */
export async function getCallRoom(roomId: string): Promise<CallRoom | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
        const data = await redis.get(`${ROOM_PREFIX}${roomId}`);
        if (!data) return null;
        return (typeof data === 'string' ? JSON.parse(data) : data) as CallRoom;
    } catch (err) {
        console.error('[Call] getCallRoom error:', err);
        return null;
    }
}

/**
 * Mettre à jour une salle d'appel
 */
export async function updateCallRoom(room: CallRoom): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        await redis.set(`${ROOM_PREFIX}${room.roomId}`, JSON.stringify(room), { ex: TTL_ROOM });
        return true;
    } catch (err) {
        console.error('[Call] updateCallRoom error:', err);
        return false;
    }
}

/**
 * Ajouter un participant à une salle
 */
export async function addParticipantToRoom(roomId: string, userId: string): Promise<boolean> {
    const room = await getCallRoom(roomId);
    if (!room) return false;

    if (!room.participants.includes(userId)) {
        room.participants.push(userId);
        room.isGroup = room.participants.length > 2;
        
        // Retirer des invitations en attente si présent
        room.pendingInvites = room.pendingInvites.filter(id => id !== userId);
        
        return await updateCallRoom(room);
    }
    return true;
}

/**
 * Retirer un participant d'une salle
 * Retourne le nouveau host si le host original est parti
 */
export async function removeParticipantFromRoom(
    roomId: string, 
    userId: string
): Promise<{ success: boolean; newHostId?: string; shouldEnd: boolean }> {
    const room = await getCallRoom(roomId);
    if (!room) return { success: false, shouldEnd: true };

    room.participants = room.participants.filter(id => id !== userId);
    room.pendingInvites = room.pendingInvites.filter(id => id !== userId);

    // Si plus de participants, supprimer la salle
    if (room.participants.length === 0) {
        await deleteCallRoom(roomId);
        return { success: true, shouldEnd: true };
    }

    // Si le host part, transférer à l'ancien participant
    let newHostId: string | undefined;
    if (room.hostId === userId && room.participants.length > 0) {
        newHostId = room.participants[0];
        room.hostId = newHostId;
    }

    await updateCallRoom(room);
    return { success: true, newHostId, shouldEnd: false };
}

/**
 * Supprimer une salle d'appel
 */
export async function deleteCallRoom(roomId: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        await redis.del(`${ROOM_PREFIX}${roomId}`);
        return true;
    } catch (err) {
        console.error('[Call] deleteCallRoom error:', err);
        return false;
    }
}

/**
 * Trouver la salle d'un utilisateur
 */
export async function getRoomByParticipant(userId: string): Promise<CallRoom | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
        // Scan toutes les clés de salle (pas optimal mais fonctionne pour petite échelle)
        const keys = await redis.keys(`${ROOM_PREFIX}*`);
        for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
                const room = (typeof data === 'string' ? JSON.parse(data) : data) as CallRoom;
                if (room.participants.includes(userId)) {
                    return room;
                }
            }
        }
        return null;
    } catch (err) {
        console.error('[Call] getRoomByParticipant error:', err);
        return null;
    }
}

/**
 * Créer une invitation à rejoindre une salle
 */
export async function createRoomInvitation(
    roomId: string,
    inviteeId: string,
    hostId: string,
    hostName: string,
    callType: 'video' | 'audio'
): Promise<string> {
    const redis = getRedis();
    if (!redis) return '';

    try {
        const joinToken = `token_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        const invitation: RoomInvitation = {
            roomId,
            hostId,
            hostName,
            callType,
            invitedAt: Date.now(),
            joinToken,
        };
        
        await redis.set(
            `${ROOM_INVITE_PREFIX}${inviteeId}:${roomId}`,
            JSON.stringify(invitation),
            { ex: TTL_INVITE }
        );
        
        return joinToken;
    } catch (err) {
        console.error('[Call] createRoomInvitation error:', err);
        return '';
    }
}

/**
 * Récupérer une invitation
 */
export async function getRoomInvitation(
    inviteeId: string, 
    roomId: string
): Promise<RoomInvitation | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
        const data = await redis.get(`${ROOM_INVITE_PREFIX}${inviteeId}:${roomId}`);
        if (!data) return null;
        return (typeof data === 'string' ? JSON.parse(data) : data) as RoomInvitation;
    } catch (err) {
        console.error('[Call] getRoomInvitation error:', err);
        return null;
    }
}

/**
 * Supprimer une invitation
 */
export async function clearRoomInvitation(inviteeId: string, roomId: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        await redis.del(`${ROOM_INVITE_PREFIX}${inviteeId}:${roomId}`);
        return true;
    } catch (err) {
        console.error('[Call] clearRoomInvitation error:', err);
        return false;
    }
}

/**
 * Vérifier si une invitation est valide
 */
export async function validateRoomInvitation(
    inviteeId: string,
    roomId: string,
    joinToken: string
): Promise<boolean> {
    const invitation = await getRoomInvitation(inviteeId, roomId);
    return invitation !== null && invitation.joinToken === joinToken;
}
