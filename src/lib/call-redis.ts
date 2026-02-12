/**
 * État des appels dans Redis
 * Compatible Vercel - Upstash Redis
 */

import { getRedis } from './redis';

const CALL_PREFIX = 'call:user:';
const PENDING_PREFIX = 'call:pending:';
const TTL_ACTIVE = 300; // 5 min max en appel
const TTL_PENDING = 60; // Appel en attente 60s

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
            result[id] = data ? (JSON.parse(data) as CallState) : null;
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
