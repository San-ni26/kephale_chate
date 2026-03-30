/**
 * 🔒 AUTH-RATE-LIMIT : Rate limiter strict pour les endpoints d'authentification
 * 
 * Limites séparées du rate limiter global (100 req/15min) :
 * - login          : 10 tentatives / 15 min par IP
 * - verify-otp     :  5 tentatives / 15 min par IP  ← anti-bruteforce OTP
 * - reset-password :  5 tentatives / 15 min par IP
 * - forgot-password: 5 tentatives / 15 min par IP
 * - resend-otp     :  3 tentatives / 15 min par IP
 * - register       : 5 tentatives / 15 min par IP
 */

import { getRedis } from '@/src/lib/redis';

type AuthEndpoint = 'login' | 'verify-otp' | 'reset-password' | 'forgot-password' | 'resend-otp' | 'register';

const AUTH_LIMITS: Record<AuthEndpoint, { max: number; windowSec: number }> = {
    'login': { max: 10, windowSec: 900 },
    'verify-otp': { max: 5, windowSec: 900 },
    'reset-password': { max: 5, windowSec: 900 },
    'forgot-password': { max: 5, windowSec: 900 },
    'resend-otp': { max: 3, windowSec: 900 },
    'register': { max: 5, windowSec: 900 },
};

// In-memory fallback
const memStore = new Map<string, { count: number; resetTime: number }>();

function memLimit(key: string, max: number, windowSec: number) {
    const now = Date.now();
    const entry = memStore.get(key);
    if (!entry || now > entry.resetTime) {
        memStore.set(key, { count: 1, resetTime: now + windowSec * 1000 });
        return { allowed: true, remaining: max - 1, resetTime: now + windowSec * 1000 };
    }
    entry.count++;
    return {
        allowed: entry.count <= max,
        remaining: Math.max(0, max - entry.count),
        resetTime: entry.resetTime,
    };
}

/**
 * Rate limiting strict pour les endpoints Auth
 */
export async function checkAuthRateLimit(
    endpoint: AuthEndpoint,
    ip: string
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const config = AUTH_LIMITS[endpoint];
    const key = `auth-ratelimit:${endpoint}:${ip.replace(/[^a-zA-Z0-9_:.-]/g, '_')}`;

    const redis = getRedis();
    if (!redis) {
        return memLimit(key, config.max, config.windowSec);
    }

    try {
        const multi = redis.multi();
        multi.incr(key);
        multi.expire(key, config.windowSec);
        const results = await multi.exec();
        const count = (results?.[0] as number) ?? 1;

        if (count > config.max) {
            const ttl = await redis.ttl(key);
            return {
                allowed: false,
                remaining: 0,
                resetTime: Date.now() + (ttl > 0 ? ttl * 1000 : config.windowSec * 1000),
            };
        }

        return {
            allowed: true,
            remaining: Math.max(0, config.max - count),
            resetTime: Date.now() + config.windowSec * 1000,
        };
    } catch {
        return memLimit(key, config.max, config.windowSec);
    }
}
