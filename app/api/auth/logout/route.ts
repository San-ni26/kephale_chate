import { NextRequest, NextResponse } from 'next/server';
import { clearAuth } from '@/src/lib/auth-client';

export async function POST(request: NextRequest) {
    try {
        // Create response
        const response = NextResponse.json(
            { message: 'Déconnexion réussie' },
            { status: 200 }
        );

        // Clear auth cookie
        response.cookies.set('auth-token', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 0,
            path: '/',
        });

        return response;

    } catch (error) {
        console.error('Logout error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la déconnexion' },
            { status: 500 }
        );
    }
}
