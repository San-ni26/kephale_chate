import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { hashForSearch, decryptPII } from '@/src/lib/server-crypto';

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

        const isExactEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);

        let users;

        if (isExactEmail) {
            // Recherche exacte par email : utiliser le HMAC-SHA256 (déterministe)
            const emailHash = hashForSearch(query);
            users = await prisma.user.findMany({
                where: {
                    AND: [
                        {
                            OR: [
                                { emailHash },                       // Comptes chiffrés (v2)
                                { email: query },                    // Comptes legacy (email en clair)
                                { name: { contains: query, mode: 'insensitive' } }, // Nom également
                            ],
                        },
                        { isVerified: true },
                        { isBanned: false },
                        { id: { not: user.userId } },
                    ],
                },
                select: { id: true, name: true, email: true, phone: true, publicKey: true, isOnline: true, lastSeen: true },
                take: 20,
            });
        } else {
            // Recherche partielle : uniquement par nom (les emails chiffrés ne peuvent pas être cherchés par fragment)
            users = await prisma.user.findMany({
                where: {
                    AND: [
                        {
                            OR: [
                                { name: { contains: query, mode: 'insensitive' } },
                                { email: { contains: query } }, // Comptes legacy (email en clair)
                            ],
                        },
                        { isVerified: true },
                        { isBanned: false },
                        { id: { not: user.userId } },
                    ],
                },
                select: { id: true, name: true, email: true, phone: true, publicKey: true, isOnline: true, lastSeen: true },
                take: 20,
            });
        }

        // Déchiffrer les emails dans la réponse
        const usersDecrypted = users.map(u => ({
            ...u,
            email: decryptPII(u.email) || u.email,
            phone: u.phone ? (decryptPII(u.phone) || u.phone) : null,
        }));

        return NextResponse.json({ users: usersDecrypted }, { status: 200 });

    } catch (error) {
        console.error('Search users error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la recherche' },
            { status: 500 }
        );
    }
}
