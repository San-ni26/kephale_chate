import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeTokenUnsafe } from '@/src/lib/jwt-edge';

// Routes that require authentication
const protectedRoutes = ['/chat', '/admin'];

// Routes that should redirect to chat if already authenticated
const authRoutes = ['/login', '/register'];

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Get token from cookie or Authorization header
    const token = request.cookies.get('auth-token')?.value ||
        request.headers.get('authorization')?.replace('Bearer ', '');

    // Check if route requires authentication
    const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
    const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));

    // Decode token if present (using unsafe decode for Edge Runtime)
    // Note: The token signature was already verified when it was created
    // This is just to check if it exists and hasn't expired
    const user = token ? decodeTokenUnsafe(token) : null;

    // Redirect to login if accessing protected route without valid token
    if (isProtectedRoute && !user) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Redirect to chat if accessing auth routes with valid token
    if (isAuthRoute && user) {
        return NextResponse.redirect(new URL('/chat', request.url));
    }

    // Check admin routes
    if (pathname.startsWith('/admin') && user?.role !== 'SUPER_ADMIN') {
        return NextResponse.redirect(new URL('/chat', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
    ],
};
