import jwt from 'jsonwebtoken';

export interface JWTPayload {
    userId: string;
    email: string;
    name?: string;
    role: string;
}

const FALLBACK_SECRET = 'fallback-secret-key';
const JWT_SECRET = process.env.JWT_SECRET || FALLBACK_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/** En production, refuse d'utiliser le secret par défaut */
export function ensureJwtSecret(): void {
    if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === FALLBACK_SECRET)) {
        throw new Error('JWT_SECRET doit être défini en production. Définissez la variable d\'environnement JWT_SECRET.');
    }
}

/**
 * Generate JWT token
 */
export function generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
        return decoded;
    } catch (error) {
        console.error('JWT verification failed:', error);
        return null;
    }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}
