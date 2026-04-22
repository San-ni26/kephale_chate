import { NextRequest, NextResponse } from 'next/server';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { createCallRoom, createRoomInvitation } from '@/src/lib/call-redis';
import { prisma } from '@/src/lib/prisma';
import { decryptPII } from '@/src/lib/server-crypto';

/**
 * POST /api/call/room/create
 * Créer une nouvelle salle d'appel (appel groupe)
 * 
 * Body: { callType: 'video' | 'audio', initialInvitees?: string[] }
 * Response: { roomId, joinToken, publicLink }
 */
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const { callType = 'video', initialInvitees = [] } = body;

        if (!['video', 'audio'].includes(callType)) {
            return NextResponse.json(
                { error: 'callType doit être "video" ou "audio"' },
                { status: 400 }
            );
        }

        // Générer un roomId unique
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        // Créer la room dans Redis
        const roomCreated = await createCallRoom(roomId, user.userId, callType);
        if (!roomCreated) {
            return NextResponse.json(
                { error: 'Erreur lors de la création de la salle' },
                { status: 500 }
            );
        }

        // Créer un token public pour le partage de lien
        const publicToken = await createRoomInvitation(
            roomId,
            'public', // Token public valide pour tous
            user.userId,
            'Lien public',
            callType
        );

        // Inviter les participants initiaux si spécifiés
        const inviteResults = [];
        for (const inviteeId of initialInvitees) {
            if (inviteeId === user.userId) continue;
            
            const token = await createRoomInvitation(
                roomId,
                inviteeId,
                user.userId,
                'Invitation',
                callType
            );
            
            inviteResults.push({ userId: inviteeId, token });
        }

        // Construire le lien public
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const publicLink = `${baseUrl}/call/join?room=${roomId}&token=${publicToken}`;

        return NextResponse.json({
            success: true,
            roomId,
            joinToken: publicToken,
            publicLink,
            callType,
            hostId: user.userId,
            initialInvites: inviteResults.length,
        });
    } catch (error) {
        console.error('[Call] Create room error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la création de la salle' },
            { status: 500 }
        );
    }
}
