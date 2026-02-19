import { NextRequest, NextResponse } from 'next/server';
import { getPusher } from '@/src/lib/pusher-server';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { prisma } from '@/src/lib/prisma';

export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.text();
        const params = new URLSearchParams(body);
        const socketId = params.get('socket_id');
        const channelName = params.get('channel_name');

        if (!socketId || !channelName) {
            return NextResponse.json({ error: 'Missing socket_id or channel_name' }, { status: 400 });
        }

        let pusher;
        try {
            pusher = getPusher();
        } catch (pusherErr: unknown) {
            const msg = pusherErr instanceof Error ? pusherErr.message : 'Pusher non configuré';
            console.error('Pusher auth - config error:', msg);
            return NextResponse.json(
                { error: 'Service de messagerie temporairement indisponible' },
                { status: 503 }
            );
        }

        // For presence channels, include user info
        if (channelName.startsWith('presence-')) {
            // Verify user has access to the conversation
            const conversationMatch = channelName.match(/^presence-conversation-(.+)$/);
            if (conversationMatch) {
                const conversationId = conversationMatch[1];
                const membership = await prisma.groupMember.findFirst({
                    where: {
                        groupId: conversationId,
                        userId: user.userId,
                    },
                });

                if (!membership) {
                    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
                }
            }

            const presenceData = {
                user_id: user.userId,
                user_info: {
                    email: user.email || '',
                },
            };

            const authResponse = pusher.authorizeChannel(socketId, channelName, presenceData);
            return NextResponse.json(authResponse);
        }

        // For private channels, verify ownership
        if (channelName.startsWith('private-user-')) {
            const channelUserId = channelName.replace('private-user-', '');
            if (channelUserId !== user.userId) {
                return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
            }
        }

        const authResponse = pusher.authorizeChannel(socketId, channelName);
        return NextResponse.json(authResponse);
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        const errStack = error instanceof Error ? error.stack : undefined;
        console.error('Pusher auth error:', errMsg, errStack);
        return NextResponse.json(
            {
                error: 'Erreur d\'authentification',
                ...(process.env.NODE_ENV === 'development' && { detail: errMsg }),
            },
            { status: 500 }
        );
    }
}
