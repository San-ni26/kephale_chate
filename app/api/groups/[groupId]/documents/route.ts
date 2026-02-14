import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { handleApiError } from '@/src/lib/api-response';

const DEFAULT_DOCUMENT_TITLE = 'Notes';

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

/** GET: Liste des documents (dossiers de notes) du groupe. Crée un document "Notes" par défaut si aucun. */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const { groupId } = await params;
        const result = await ensureGroupMember(request, groupId);
        if (result.error) return result.error;

        let documents = await prisma.groupDocument.findMany({
            where: { groupId },
            include: {
                _count: { select: { notes: true } },
                notes: {
                    orderBy: { updatedAt: 'desc' },
                    take: 5,
                    select: { id: true, title: true, updatedAt: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        if (documents.length === 0) {
            const defaultDoc = await prisma.groupDocument.create({
                data: { groupId, title: DEFAULT_DOCUMENT_TITLE },
                include: {
                    _count: { select: { notes: true } },
                    notes: true,
                },
            });
            documents = [defaultDoc];
        }

        return NextResponse.json({ documents });
    } catch (error) {
        return handleApiError(error);
    }
}
