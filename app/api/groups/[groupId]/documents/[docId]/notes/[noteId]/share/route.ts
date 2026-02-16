import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { apiError, handleApiError } from '@/src/lib/api-response';
import { emitToUser } from '@/src/lib/pusher-server';

const shareSchema = z.object({
    email: z.string().email('Email invalide'),
    canEdit: z.boolean().optional().default(true),
});
const unshareSchema = z.object({
    sharedWithId: z.string().min(1, 'sharedWithId requis'),
});
const updateShareSchema = z.object({
    sharedWithId: z.string().min(1, 'sharedWithId requis'),
    canEdit: z.boolean(),
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

/** POST: Partager la note avec un utilisateur (par email). Seul le créateur peut partager. */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string; docId: string; noteId: string }> }
) {
    try {
        const { groupId, docId, noteId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const note = await prisma.groupNote.findFirst({
            where: { id: noteId, documentId: docId, createdBy: userId },
        });
        if (!note) {
            return NextResponse.json({ error: 'Note non trouvée ou vous n\'êtes pas le créateur.' }, { status: 404 });
        }

        const body = await request.json();
        const validated = shareSchema.safeParse(body);
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
            return NextResponse.json({ error: 'Vous ne pouvez pas partager une note avec vous-même.' }, { status: 400 });
        }

        // S'assurer que l'utilisateur cible est membre du groupe (ajout automatique si besoin)
        let isGroupMember = await prisma.groupMember.findFirst({
            where: { groupId, userId: targetUser.id },
        });
        if (!isGroupMember) {
            await prisma.groupMember.create({
                data: { groupId, userId: targetUser.id },
            });
        }

        const existing = await prisma.groupNoteShare.findUnique({
            where: { noteId_sharedWithId: { noteId, sharedWithId: targetUser.id } },
        });
        if (existing) {
            return NextResponse.json({ error: 'Cette note est déjà partagée avec cet utilisateur.' }, { status: 400 });
        }

        const creator = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true },
        });
        const creatorName = creator?.name || creator?.email || 'Quelqu\'un';

        const notifContent = `${creatorName} a partagé une note avec vous : "${note.title}"`;

        const [, notification] = await prisma.$transaction([
            prisma.groupNoteShare.create({
                data: {
                    noteId,
                    sharedWithId: targetUser.id,
                    canEdit: validated.data.canEdit ?? true,
                },
            }),
            prisma.notification.create({
                data: {
                    userId: targetUser.id,
                    content: notifContent,
                },
            }),
        ]);

        try {
            await emitToUser(targetUser.id, 'notification:new', {
                id: notification.id,
                content: notifContent,
                type: 'note_share',
                groupId,
                senderName: creatorName,
                createdAt: notification.createdAt instanceof Date ? notification.createdAt.toISOString() : String(notification.createdAt),
            });
        } catch (err) {
            console.error('[Share] Error sending Pusher notification:', err);
        }

        return NextResponse.json({
            success: true,
            sharedWith: { id: targetUser.id, name: targetUser.name, email: targetUser.email, canEdit: validated.data.canEdit ?? true },
        });
    } catch (error) {
        return handleApiError(error);
    }
}

/** DELETE: Retirer le partage d'une note. Seul le créateur peut retirer. */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string; docId: string; noteId: string }> }
) {
    try {
        const { groupId, docId, noteId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const note = await prisma.groupNote.findFirst({
            where: { id: noteId, documentId: docId, createdBy: userId },
        });
        if (!note) {
            return NextResponse.json({ error: 'Note non trouvée ou vous n\'êtes pas le créateur.' }, { status: 404 });
        }

        const url = new URL(request.url);
        const sharedWithId = url.searchParams.get('sharedWithId') || (await request.json().catch(() => ({}))).sharedWithId;
        const validated = unshareSchema.safeParse({ sharedWithId });
        if (!validated.success) {
            return apiError('sharedWithId requis (query ?sharedWithId=xxx ou body)', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const deleted = await prisma.groupNoteShare.deleteMany({
            where: {
                noteId,
                sharedWithId: validated.data.sharedWithId,
            },
        });
        if (deleted.count === 0) {
            return NextResponse.json({ error: 'Partage non trouvé.' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error);
    }
}

/** PATCH: Modifier les permissions (canEdit) d'un partage. Seul le créateur peut modifier. */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string; docId: string; noteId: string }> }
) {
    try {
        const { groupId, docId, noteId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;
        const userId = result.userId!;

        const note = await prisma.groupNote.findFirst({
            where: { id: noteId, documentId: docId, createdBy: userId },
        });
        if (!note) {
            return NextResponse.json({ error: 'Note non trouvée ou vous n\'êtes pas le créateur.' }, { status: 404 });
        }

        const body = await request.json();
        const validated = updateShareSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: validated.error.issues });
        }

        const updated = await prisma.groupNoteShare.updateMany({
            where: {
                noteId,
                sharedWithId: validated.data.sharedWithId,
            },
            data: { canEdit: validated.data.canEdit },
        });
        if (updated.count === 0) {
            return NextResponse.json({ error: 'Partage non trouvé.' }, { status: 404 });
        }

        return NextResponse.json({ success: true, canEdit: validated.data.canEdit });
    } catch (error) {
        return handleApiError(error);
    }
}
