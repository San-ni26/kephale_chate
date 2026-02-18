/**
 * POST: Vérifier le code pour accéder à la discussion (ne désactive pas le verrouillage)
 * Utilisé à chaque ouverture de la discussion pour afficher le contenu
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import bcrypt from 'bcryptjs';

const CODE_REGEX = /^\d{4}$/;

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const code = typeof body.code === 'string' ? body.code.trim() : '';

        if (!CODE_REGEX.test(code)) {
            return NextResponse.json(
                { error: 'Le code doit contenir exactement 4 chiffres' },
                { status: 400 }
            );
        }

        const group = await prisma.group.findUnique({
            where: { id },
            include: { members: true },
        });

        if (!group) {
            return NextResponse.json({ error: 'Conversation non trouvée' }, { status: 404 });
        }

        const isMember = group.members.some((m) => m.userId === user.userId);
        if (!isMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        if (!group.lockCodeHash) {
            return NextResponse.json(
                { error: 'Cette discussion n\'est pas verrouillée' },
                { status: 400 }
            );
        }

        const valid = await bcrypt.compare(code, group.lockCodeHash);
        if (!valid) {
            return NextResponse.json(
                { error: 'Code incorrect' },
                { status: 400 }
            );
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Verify lock code error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la vérification' },
            { status: 500 }
        );
    }
}
