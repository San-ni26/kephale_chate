/**
 * API Présence - heartbeat et statut en ligne
 * Compatible Vercel - utilise Redis (Upstash)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { setUserOnline, setUserOffline, getOnlineUserIds } from '@/src/lib/presence';

/**
 * POST - Heartbeat : marquer l'utilisateur comme en ligne ou hors ligne
 * Body: { offline?: boolean } - si true, marque offline. Sinon heartbeat (online).
 * Appelé périodiquement par le client quand l'app est ouverte.
 */
export async function POST(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    let body: { offline?: boolean } = {};
    try {
        body = await request.json();
    } catch {
        // Body vide = heartbeat
    }

    if (body.offline === true) {
        await setUserOffline(user.userId);
        return NextResponse.json({ success: true, online: false });
    }

    const ok = await setUserOnline(user.userId);
    return NextResponse.json({
        success: true,
        online: ok,
    });
}

/**
 * GET - Récupérer le statut en ligne de plusieurs utilisateurs
 * Query: ?userIds=id1,id2,id3
 */
export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userIdsParam = searchParams.get('userIds');
    if (!userIdsParam) {
        return NextResponse.json({ error: 'userIds requis (ex: ?userIds=id1,id2)' }, { status: 400 });
    }

    const userIds = userIdsParam.split(',').map(id => id.trim()).filter(Boolean);
    if (userIds.length === 0) {
        return NextResponse.json({ presence: {} });
    }

    // Limite de 100 IDs pour éviter l'abus
    const limitedIds = userIds.slice(0, 100);

    const presence = await getOnlineUserIds(limitedIds);
    return NextResponse.json({ presence });
}
