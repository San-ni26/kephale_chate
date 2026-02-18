/**
 * POST: Changer le code de verrouillage
 * Body: { currentCode, newCode }
 * Autorisé : l'utilisateur qui a créé le code OU les deux si les deux sont Pro
 * Envoie le nouveau code par email à l'autre utilisateur Pro
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
        const currentCode = typeof body.currentCode === 'string' ? body.currentCode.trim() : '';
        const newCode = typeof body.newCode === 'string' ? body.newCode.trim() : '';

        if (!CODE_REGEX.test(currentCode) || !CODE_REGEX.test(newCode)) {
            return NextResponse.json(
                { error: 'Les codes doivent contenir exactement 4 chiffres' },
                { status: 400 }
            );
        }

        if (currentCode === newCode) {
            return NextResponse.json(
                { error: 'Le nouveau code doit être différent de l\'ancien' },
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

        const valid = await bcrypt.compare(currentCode, group.lockCodeHash);
        if (!valid) {
            return NextResponse.json(
                { error: 'Code actuel incorrect' },
                { status: 400 }
            );
        }

        const memberIds = group.members.map((m) => m.userId);
        const proSubs = await prisma.userProSubscription.findMany({
            where: { userId: { in: memberIds }, isActive: true },
            select: { userId: true, endDate: true },
        });
        const proUserIds = new Set(
            proSubs.filter((s) => isUserProActive(s.endDate)).map((s) => s.userId)
        );
        const bothPro = proUserIds.has(user.userId) && memberIds.every((mid) => proUserIds.has(mid));
        const isSetter = group.lockSetByUserId === user.userId;

        if (!isSetter && !bothPro) {
            return NextResponse.json(
                { error: 'Seul l\'utilisateur qui a créé le code ou les deux membres Pro peuvent modifier le code' },
                { status: 403 }
            );
        }

        const lockCodeHash = await bcrypt.hash(newCode, 10);

        await prisma.group.update({
            where: { id },
            data: {
                lockCodeHash,
                lockSetByUserId: user.userId,
                lockedAt: new Date(),
            },
        });

        // Envoyer le nouveau code par email à l'autre utilisateur Pro
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
                    newCode,
                    setterUser?.name ?? null,
                    true
                );
            }
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Change lock code error:', error);
        return NextResponse.json(
            { error: 'Erreur lors du changement de code' },
            { status: 500 }
        );
    }
}
