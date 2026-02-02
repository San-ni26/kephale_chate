import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');

        if (!query || query.length < 2) {
            return NextResponse.json(
                { error: 'La recherche doit contenir au moins 2 caractères' },
                { status: 400 }
            );
        }

        // Search users by email, phone, or name
        const users = await prisma.user.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { email: { contains: query } },
                            { name: { contains: query } },
                            { phone: { contains: query } },
                        ],
                    },
                    { isVerified: true },
                    { isBanned: false },
                    { id: { not: user.userId } }, // Exclude current user
                ],
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                publicKey: true,
                isOnline: true,
                lastSeen: true,
            },
            take: 20, // Increased limit
        });

        return NextResponse.json({ users }, { status: 200 });

    } catch (error) {
        console.error('Search users error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la recherche' },
            { status: 500 }
        );
    }
}
