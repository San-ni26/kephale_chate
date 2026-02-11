import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/jwt';
import { setUserOffline } from '@/src/lib/presence';

export async function POST(request: NextRequest) {
    try {
        // Marquer offline dans Redis avant de clear le token
        const token = request.cookies.get('auth-token')?.value;
        if (token) {
            const payload = verifyToken(token);
            if (payload?.userId) {
                await setUserOffline(payload.userId);
            }
        }

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
