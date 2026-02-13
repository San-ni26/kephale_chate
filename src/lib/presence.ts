/**
 * User presence (online/offline) via Redis
 * Compatible Vercel - utilise Upstash Redis (REST API)
 */

import { getRedis as getRedisImpl } from './redis';

/** Exposé pour les modules qui importent depuis presence (ex. api/admin/performance). */
export const getRedis = getRedisImpl;

const PRESENCE_PREFIX = 'presence:user:';
const PRESENCE_TTL_SEC = 60; // Considéré offline après 60s sans heartbeat

/** Indique si Redis est configuré (pour le tableau de bord admin). */
export function isRedisAvailable(): boolean {
    return getRedis() !== null;
}

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

const PRESENCE_KEY_PATTERN = 'presence:user:*';

/**
 * Nombre d'utilisateurs actuellement en ligne (clés Redis presence).
 * Utilisé pour le tableau de bord admin / performances.
 */
export async function getOnlineUsersCount(): Promise<number> {
    const redis = getRedis();
    if (!redis) return 0;

    try {
        let cursor = 0;
        let total = 0;
        do {
            const [nextCursor, keys] = await redis.scan(cursor, {
                match: PRESENCE_KEY_PATTERN,
                count: 200,
            });
            cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor;
            total += Array.isArray(keys) ? keys.length : 0;
        } while (cursor !== 0);
        return total;
    } catch (err) {
        console.error('[Presence] getOnlineUsersCount error:', err);
        return 0;
    }
}
