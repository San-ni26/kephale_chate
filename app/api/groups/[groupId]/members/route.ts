import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { apiError, handleApiError } from '@/src/lib/api-response';

const addMemberSchema = z.object({
    email: z.string().email('Email invalide'),
});

async function ensureGroupMember(request: NextRequest, groupId: string) {
    const authError = await authenticate(request);
    if (authError) return { error: authError, userId: null };
    const user = (request as AuthenticatedRequest).user;
    if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }), userId: null };

    const member = await prisma.groupMember.findFirst({
        where: { groupId, userId: user.userId },
    });
    if (!member) {
        return {
            error: NextResponse.json({ error: 'Accès refusé. Vous n\'êtes pas membre de ce groupe.' }, { status: 403 }),
            userId: null,
        };
    }
    return { error: null, userId: user.userId };
}

/** GET: Liste des membres du groupe */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;

        const members = await prisma.groupMember.findMany({
            where: { groupId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        isOnline: true,
                        lastSeen: true,
                    },
                },
            },
            orderBy: { joinedAt: 'asc' },
        });

        return NextResponse.json({ members });
    } catch (error) {
        return handleApiError(error);
    }
}

/** POST: Ajouter un membre au groupe (par email) */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const group = await prisma.group.findFirst({
            where: { id: groupId, deptId: null },
        });
        if (!group) {
            return NextResponse.json({ error: 'Groupe non trouvé' }, { status: 404 });
        }

        const body = await request.json();
        const validated = addMemberSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Email invalide', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const targetUser = await prisma.user.findFirst({
            where: {
                email: validated.data.email.toLowerCase(),
                isVerified: true,
                isBanned: false,
            },
        });
        if (!targetUser) {
            return NextResponse.json({ error: 'Aucun utilisateur trouvé avec cet email.' }, { status: 404 });
        }
        if (targetUser.id === userId) {
            return NextResponse.json({ error: 'Vous êtes déjà membre du groupe.' }, { status: 400 });
        }

        const existing = await prisma.groupMember.findFirst({
            where: { groupId, userId: targetUser.id },
        });
        if (existing) {
            return NextResponse.json({ error: 'Cet utilisateur est déjà membre du groupe.' }, { status: 400 });
        }

        await prisma.groupMember.create({
            data: { groupId, userId: targetUser.id },
        });

        const member = await prisma.groupMember.findFirst({
            where: { groupId, userId: targetUser.id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        isOnline: true,
                        lastSeen: true,
                    },
                },
            },
        });

        return NextResponse.json({
            message: 'Membre ajouté',
            member,
        }, { status: 201 });
    } catch (error) {
        return handleApiError(error);
    }
}

/** DELETE: Retirer un membre du groupe (?userId=xxx) */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const url = new URL(request.url);
        const targetUserId = url.searchParams.get('userId');
        if (!targetUserId) {
            return apiError('userId requis (query ?userId=xxx)', 400);
        }

        if (targetUserId === userId) {
            return NextResponse.json({ error: 'Vous ne pouvez pas vous retirer du groupe. Supprimez le groupe ou quittez-le.' }, { status: 400 });
        }

        const group = await prisma.group.findFirst({
            where: { id: groupId, deptId: null },
        });
        if (!group) {
            return NextResponse.json({ error: 'Groupe non trouvé' }, { status: 404 });
        }

        const deleted = await prisma.groupMember.deleteMany({
            where: {
                groupId,
                userId: targetUserId,
            },
        });
        if (deleted.count === 0) {
            return NextResponse.json({ error: 'Membre non trouvé.' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Membre retiré' });
    } catch (error) {
        return handleApiError(error);
    }
}
