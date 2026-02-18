/**
 * POST: Verrouiller une discussion avec un code à 4 chiffres (Pro uniquement)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { isUserProActive } from '@/src/lib/user-pro';
import { sendDiscussionLockCodeEmail } from '@/src/lib/email';
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

        if (!group.isDirect || group.members.length !== 2) {
            return NextResponse.json(
                { error: 'Le verrouillage par code est réservé aux discussions directes' },
                { status: 400 }
            );
        }

        const proSub = await prisma.userProSubscription.findFirst({
            where: { userId: user.userId, isActive: true },
        });
        if (!proSub || !isUserProActive(proSub.endDate)) {
            return NextResponse.json(
                { error: 'Seuls les utilisateurs Pro peuvent verrouiller une discussion' },
                { status: 403 }
            );
        }

        const lockCodeHash = await bcrypt.hash(code, 10);

        await prisma.group.update({
            where: { id },
            data: {
                lockCodeHash,
                lockSetByUserId: user.userId,
                lockedAt: new Date(),
            },
        });

        // Envoyer le code par email à l'autre utilisateur s'il est Pro
        const otherMember = group.members.find((m) => m.userId !== user.userId);
        if (otherMember) {
            const [otherUser, setterUser] = await Promise.all([
                prisma.user.findUnique({
                    where: { id: otherMember.userId },
                    select: { email: true, name: true },
                }),
                prisma.user.findUnique({
                    where: { id: user.userId },
                    select: { name: true },
                }),
            ]);
            const otherProSub = await prisma.userProSubscription.findFirst({
                where: { userId: otherMember.userId, isActive: true },
            });
            if (otherUser?.email && otherProSub && isUserProActive(otherProSub.endDate)) {
                await sendDiscussionLockCodeEmail(
                    otherUser.email,
                    otherUser.name,
                    code,
                    setterUser?.name ?? null,
                    false
                );
            }
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Lock conversation error:', error);
        return NextResponse.json(
            { error: 'Erreur lors du verrouillage' },
            { status: 500 }
        );
    }
}
