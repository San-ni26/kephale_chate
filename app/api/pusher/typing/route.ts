import { NextRequest, NextResponse } from 'next/server';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { emitToConversation } from '@/src/lib/pusher-server';

/**
 * POST /api/pusher/typing
 * Broadcasts typing indicators to a conversation channel.
 */
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { conversationId, isTyping } = await request.json();

        if (!conversationId) {
            return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
        }

        await emitToConversation(conversationId, 'typing:user', {
            userId: user.userId,
            conversationId,
            isTyping: !!isTyping,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Typing signal error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}
