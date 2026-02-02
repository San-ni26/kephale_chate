/**
 * Simple in-memory rate limiter
 * For production, use Redis or a dedicated rate limiting service
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '100');
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15 minutes

/**
 * Check if request should be rate limited
 */
export function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = rateLimitStore.get(identifier);

    // Clean up expired entries periodically
    if (Math.random() < 0.01) {
        cleanupExpiredEntries();
    }

    if (!entry || now > entry.resetTime) {
        // Create new entry
        const newEntry: RateLimitEntry = {
            count: 1,
            resetTime: now + WINDOW_MS,
        };
        rateLimitStore.set(identifier, newEntry);
        return {
            allowed: true,
            remaining: MAX_REQUESTS - 1,
            resetTime: newEntry.resetTime,
        };
    }

    // Increment existing entry
    entry.count++;
    rateLimitStore.set(identifier, entry);

    if (entry.count > MAX_REQUESTS) {
        return {
            allowed: false,
            remaining: 0,
            resetTime: entry.resetTime,
        };
    }

    return {
        allowed: true,
        remaining: MAX_REQUESTS - entry.count,
        resetTime: entry.resetTime,
    };
}

/**
 * Clean up expired entries from the store
 */
function cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}

/**
 * Get rate limit identifier from IP or user ID
 */
export function getRateLimitIdentifier(ip: string, userId?: string): string {
    return userId ? `user:${userId}` : `ip:${ip}`;
}
