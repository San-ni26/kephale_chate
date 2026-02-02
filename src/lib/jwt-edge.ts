/**
 * Edge-compatible JWT utilities using Web Crypto API
 * This version works in Next.js Edge Runtime (middleware)
 */

export interface JWTPayload {
    userId: string;
    email: string;
    name?: string;
    role: string;
    exp?: number;
    iat?: number;
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(str: string): string {
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return atob(base64);
}

/**
 * Verify JWT token using Web Crypto API (Edge Runtime compatible)
 */
export async function verifyTokenEdge(token: string, secret: string): Promise<JWTPayload | null> {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }

        const [headerB64, payloadB64, signatureB64] = parts;

        // Decode payload
        const payloadJson = base64UrlDecode(payloadB64);
        const payload = JSON.parse(payloadJson) as JWTPayload;

        // Check expiration
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            console.error('Token expired');
            return null;
        }

        // Verify signature
        const encoder = new TextEncoder();
        const data = encoder.encode(`${headerB64}.${payloadB64}`);
        const secretKey = encoder.encode(secret);

        // Import key
        const key = await crypto.subtle.importKey(
            'raw',
            secretKey,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        // Decode signature
        const signatureBytes = Uint8Array.from(
            base64UrlDecode(signatureB64),
            c => c.charCodeAt(0)
        );

        // Verify
        const isValid = await crypto.subtle.verify(
            'HMAC',
            key,
            signatureBytes,
            data
        );

        if (!isValid) {
            console.error('Invalid signature');
            return null;
        }

        return payload;

    } catch (error) {
        console.error('JWT verification failed:', error);
        return null;
    }
}

/**
 * Synchronous token decode (without verification) - for quick checks
 * WARNING: Only use this when you need to read the payload without verifying
 */
export function decodeTokenUnsafe(token: string): JWTPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }

        const payloadJson = base64UrlDecode(parts[1]);
        const payload = JSON.parse(payloadJson) as JWTPayload;

        // Check expiration
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return null;
        }

        return payload;
    } catch (error) {
        return null;
    }
}
