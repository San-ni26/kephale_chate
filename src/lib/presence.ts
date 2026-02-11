/**
 * User presence (online/offline) via Redis
 * Compatible Vercel - utilise Upstash Redis (REST API)
 */

import { getRedis } from './redis';

const PRESENCE_PREFIX = 'presence:user:';
const PRESENCE_TTL_SEC = 60; // Considéré offline après 60s sans heartbeat

/**
 * Marquer un utilisateur comme en ligne
 */
export async function setUserOnline(userId: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        const key = `${PRESENCE_PREFIX}${userId}`;
        await redis.set(key, Date.now(), { ex: PRESENCE_TTL_SEC });
        return true;
    } catch (err) {
        console.error('[Presence] setUserOnline error:', err);
        return false;
    }
}

/**
 * Marquer un utilisateur comme hors ligne
 */
export async function setUserOffline(userId: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        const key = `${PRESENCE_PREFIX}${userId}`;
        await redis.del(key);
        return true;
    } catch (err) {
        console.error('[Presence] setUserOffline error:', err);
        return false;
    }
}

/**
 * Vérifier quels utilisateurs sont en ligne
 * @param userIds Liste d'IDs utilisateur
 * @returns Map userId -> isOnline
 */
export async function getOnlineUserIds(userIds: string[]): Promise<Record<string, boolean>> {
    const redis = getRedis();
    const result: Record<string, boolean> = {};

    if (!redis || userIds.length === 0) {
        userIds.forEach(id => { result[id] = false; });
        return result;
    }

    try {
        const pipeline = redis.pipeline();
        userIds.forEach(id => pipeline.exists(`${PRESENCE_PREFIX}${id}`));
        const replies = (await pipeline.exec()) as number[];

        userIds.forEach((id, i) => {
            result[id] = (replies[i] ?? 0) === 1;
        });
    } catch (err) {
        console.error('[Presence] getOnlineUserIds error:', err);
        userIds.forEach(id => { result[id] = false; });
    }

    return result;
}
