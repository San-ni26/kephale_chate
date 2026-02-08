import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

/**
 * POST /api/conversations/[id]/read
 * Mark a conversation as read for the current user.
 * Updates lastReadAt on GroupMember.
 */
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

        const conversationId = params.id;

        // Update lastReadAt for this user in this conversation
        const updated = await prisma.groupMember.updateMany({
            where: {
                groupId: conversationId,
                userId: user.userId,
            },
            data: {
                lastReadAt: new Date(),
            },
        });

        if (updated.count === 0) {
            return NextResponse.json(
                { error: 'Membre non trouvé dans cette conversation' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Mark as read error:', error);
        return NextResponse.json(
            { error: 'Erreur lors du marquage comme lu' },
            { status: 500 }
        );
    }
}
