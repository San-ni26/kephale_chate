import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractTokenFromHeader } from '@/src/lib/jwt';

export interface AuthenticatedRequest extends NextRequest {
    user?: {
        userId: string;
        email: string;
        name?: string;
        role: string;
    };
}

/**
 * Middleware to authenticate requests using JWT
 */
export async function authenticate(request: NextRequest): Promise<NextResponse | null> {
    // Try to get token from Authorization header first
    const authHeader = request.headers.get('authorization');
    let token = extractTokenFromHeader(authHeader);

    // If not in header, try to get from cookie
    if (!token) {
        token = request.cookies.get('auth-token')?.value || null;
    }

    if (!token) {
        return NextResponse.json(
            { error: 'Token d\'authentification manquant' },
            { status: 401 }
        );
    }

    const payload = verifyToken(token);

    if (!payload) {
        return NextResponse.json(
            { error: 'Token invalide ou expiré' },
            { status: 401 }
        );
    }

    // Attach user info to request (for use in API handlers)
    (request as AuthenticatedRequest).user = payload;

    return null; // No error, authentication successful
}

/**
 * Middleware to check if user is admin
 */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
    const authError = await authenticate(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;

    if (user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
            { error: 'Accès refusé. Droits administrateur requis.' },
            { status: 403 }
        );
    }

    return null;
}

/**
 * Middleware to check if user is super admin
 */
export async function requireSuperAdmin(request: NextRequest): Promise<NextResponse | null> {
    const authError = await authenticate(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;

    if (user?.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
            { error: 'Accès refusé. Droits super administrateur requis.' },
            { status: 403 }
        );
    }

    return null;
}
