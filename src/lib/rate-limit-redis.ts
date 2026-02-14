/**
 * Rate limiting with Redis (Upstash) - production-ready
 * Falls back to in-memory when Redis is unavailable
 */

import { getRedis } from '@/src/lib/redis';

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const WINDOW_SEC = Math.floor(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10) / 1000); // 15 min

// In-memory fallback
const memoryStore = new Map<string, { count: number; resetTime: number }>();

function memoryRateLimit(identifier: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const resetTime = now + WINDOW_SEC * 1000;
    const entry = memoryStore.get(identifier);

    if (!entry || now > entry.resetTime) {
        memoryStore.set(identifier, { count: 1, resetTime });
        return { allowed: true, remaining: MAX_REQUESTS - 1, resetTime };
    }

    entry.count++;
    if (entry.count > MAX_REQUESTS) {
        return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }
    return { allowed: true, remaining: MAX_REQUESTS - entry.count, resetTime: entry.resetTime };
}

/**
 * Async rate limit check - uses Redis when available, memory fallback otherwise
 */
export async function checkRateLimitAsync(
    identifier: string
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const redis = getRedis();
    if (!redis) {
        return memoryRateLimit(identifier);
    }

    try {
        const key = `ratelimit:${identifier.replace(/[^a-zA-Z0-9_:.-]/g, '_')}`;
        const multi = redis.multi();
        multi.incr(key);
        multi.expire(key, WINDOW_SEC);
        const results = await multi.exec();
        const count = (results?.[0] as number) ?? 1;

        if (count > MAX_REQUESTS) {
            const ttl = await redis.ttl(key);
            return {
                allowed: false,
                remaining: 0,
                resetTime: Date.now() + (ttl > 0 ? ttl * 1000 : WINDOW_SEC * 1000),
            };
        }

        return {
            allowed: true,
            remaining: Math.max(0, MAX_REQUESTS - count),
            resetTime: Date.now() + WINDOW_SEC * 1000,
        };
    } catch (err) {
        console.warn('[rate-limit] Redis error, fallback to memory:', err);
        return memoryRateLimit(identifier);
    }
}
