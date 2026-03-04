import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { decryptPII } from '@/src/lib/server-crypto';

// DELETE /api/jobs/my-applications/[appId] — Supprimer sa candidature
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ appId: string }> }
) {
    const authError = await authenticate(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user?.userId) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { appId } = await params;
    if (!appId) {
        return NextResponse.json({ error: 'ID candidature requis' }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { email: true },
    });
    if (!dbUser) {
        return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }
    const userEmail = (decryptPII(dbUser.email) || dbUser.email || user.email || '').toLowerCase().trim();
    const jwtEmail = (user.email || '').toLowerCase().trim();
    const emailsToMatch = [...new Set([userEmail, jwtEmail].filter(Boolean))];
    if (emailsToMatch.length === 0) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const application = await prisma.jobApplication.findUnique({
        where: { id: appId },
    });
    if (!application) {
        return NextResponse.json({ error: 'Candidature non trouvée' }, { status: 404 });
    }
    const appEmail = (application.email || '').toLowerCase().trim();
    if (!emailsToMatch.includes(appEmail)) {
        return NextResponse.json({ error: 'Vous ne pouvez pas supprimer cette candidature' }, { status: 403 });
    }

    await prisma.jobApplication.delete({
        where: { id: appId },
    });

    return NextResponse.json({ success: true, message: 'Candidature supprimée' });
}
