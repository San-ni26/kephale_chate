/**
 * GET /api/call/status
 * Retourne l'état d'appel actif et/ou en attente pour l'utilisateur connecté.
 * Permet d'afficher l'appel en cours quand l'utilisateur rentre dans l'app.
 *
 * Query: ?claim=1 - réclame et supprime le pending call (pour DiscussionPage)
 *        Sinon - peek uniquement, ne supprime pas (pour CallStatusChecker)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { getCallState, getPendingCall, getAndClearPendingCall } from '@/src/lib/call-redis';
import { prisma } from '@/src/lib/prisma';

export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const shouldClaim = searchParams.get('claim') === '1';

    try {
        const [activeCall, pendingCall] = await Promise.all([
            getCallState(user.userId),
            shouldClaim ? getAndClearPendingCall(user.userId) : getPendingCall(user.userId),
        ]);

        let activeCallWithName = activeCall;
        if (activeCall?.withUserId) {
            try {
                const otherUser = await prisma.user.findUnique({
                    where: { id: activeCall.withUserId },
                    select: { name: true, email: true },
                });
                activeCallWithName = {
                    ...activeCall,
                    withUserName: otherUser?.name || otherUser?.email || 'Utilisateur',
                } as typeof activeCall & { withUserName: string };
            } catch {
                // Ignore
            }
        }

        return NextResponse.json({
            activeCall: activeCallWithName || null,
            pendingCall: pendingCall || null,
        });
    } catch (error) {
        console.error('[Call] Status error:', error);
        return NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}
