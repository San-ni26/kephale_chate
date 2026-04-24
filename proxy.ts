import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeTokenUnsafe } from '@/src/lib/jwt-edge';

// Routes that require authentication
const protectedRoutes = ['/chat', '/admin'];

// Routes that should redirect to chat if already authenticated
const authRoutes = ['/login', '/register'];

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8081',
  'https://kephale-chate.vercel.app',
];

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const origin = request.headers.get('origin') || '';

    // Handle API CORS preflight
    if (pathname.startsWith('/api')) {
        const isAllowedOrigin = allowedOrigins.includes(origin) || 
            origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:') ||
            origin.startsWith('exp://');

        // Handle OPTIONS preflight
        if (request.method === 'OPTIONS') {
            const response = new NextResponse(null, { status: 204 });
            if (isAllowedOrigin) {
                response.headers.set('Access-Control-Allow-Origin', origin);
                response.headers.set('Access-Control-Allow-Credentials', 'true');
                response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
                response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
                response.headers.set('Access-Control-Max-Age', '86400');
            }
            return response;
        }

        // Add CORS headers to API responses
        const response = NextResponse.next();
        if (isAllowedOrigin) {
            response.headers.set('Access-Control-Allow-Origin', origin);
            response.headers.set('Access-Control-Allow-Credentials', 'true');
            response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        }
        return response;
    }

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
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
    ],
};
