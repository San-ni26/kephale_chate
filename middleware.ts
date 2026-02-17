import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeTokenUnsafe } from '@/src/lib/jwt-edge';

// Routes that require authentication
const protectedRoutes = ['/chat', '/admin'];

// Routes that should redirect to chat if already authenticated
const authRoutes = ['/login', '/register'];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Get token from cookie or Authorization header
    const token = request.cookies.get('auth-token')?.value ||
        request.headers.get('authorization')?.replace('Bearer ', '');

    // Decode token if present (using unsafe decode for Edge Runtime)
    const user = token ? decodeTokenUnsafe(token) : null;

    // Page d'accueil (/) : rediriger les utilisateurs connectés vers /chat
    if (pathname === '/') {
        if (user) {
            return NextResponse.redirect(new URL('/chat', request.url));
        }
        return NextResponse.next();
    }

    // Routes protégées : rediriger vers login si non authentifié
    const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
    if (isProtectedRoute && !user) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Routes auth (login, register) : rediriger vers chat si déjà connecté
    const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));
    if (isAuthRoute && user) {
        return NextResponse.redirect(new URL('/chat', request.url));
    }

    // Admin : vérifier le rôle
    if (pathname.startsWith('/admin') && user?.role !== 'SUPER_ADMIN' && user?.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/chat', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Exclure : api, _next/static, _next/image, favicon, fichiers statiques
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
    ],
};
