import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createCollabSchema = z.object({
    orgCode: z.string().length(12, 'Le code doit contenir 12 chiffres'),
});

// GET: Liste des collaborations de l'organisation (en tant que orgA ou orgB)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId } = await params;

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_orgId: { userId: user.userId, orgId },
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Vous n\'êtes pas membre de cette organisation' },
                { status: 403 }
            );
        }

        const collaborations = await prisma.organizationCollaboration.findMany({
            where: {
                OR: [{ orgAId: orgId }, { orgBId: orgId }],
            },
            include: {
                orgA: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        logo: true,
                    },
                },
                orgB: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        logo: true,
                    },
                },
                groups: {
                    include: {
                        _count: { select: { members: true } },
                    },
                },
            },
        });

        return NextResponse.json({ collaborations }, { status: 200 });
    } catch (error) {
        console.error('Get collaborations error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des collaborations' },
            { status: 500 }
        );
    }
}

// POST: Créer une collaboration (inviter une autre organisation)
// L'utilisateur doit être admin/owner de orgA (l'org actuelle)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgAId } = await params;

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_orgId: { userId: user.userId, orgId: orgAId },
            },
        });

        if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
            return NextResponse.json(
                { error: 'Seuls les propriétaires et administrateurs peuvent créer des collaborations' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { orgCode } = createCollabSchema.parse(body);

        const orgB = await prisma.organization.findUnique({
            where: { code: orgCode },
        });

        if (!orgB) {
            return NextResponse.json(
                { error: 'Code d\'organisation invalide' },
                { status: 404 }
            );
        }

        if (orgB.id === orgAId) {
            return NextResponse.json(
                { error: 'Vous ne pouvez pas collaborer avec votre propre organisation' },
                { status: 400 }
            );
        }

        if (orgB.isSuspended) {
            return NextResponse.json(
                { error: 'Cette organisation est suspendue' },
                { status: 403 }
            );
        }

        // Vérifier si une collaboration existe déjà (dans un sens ou l'autre)
        const existing = await prisma.organizationCollaboration.findFirst({
            where: {
                OR: [
                    { orgAId, orgBId: orgB.id },
                    { orgAId: orgB.id, orgBId: orgAId },
                ],
            },
        });

        if (existing) {
            if (existing.status === 'PENDING') {
                return NextResponse.json(
                    { error: 'Une invitation de collaboration est déjà en attente' },
                    { status: 400 }
                );
            }
            if (existing.status === 'ACTIVE') {
                return NextResponse.json(
                    { error: 'Une collaboration existe déjà entre ces deux organisations' },
                    { status: 400 }
                );
            }
        }

        const collaboration = await prisma.organizationCollaboration.create({
            data: {
                orgAId,
                orgBId: orgB.id,
                status: 'PENDING',
                createdBy: user.userId,
            },
            include: {
                orgA: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        logo: true,
                    },
                },
                orgB: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        logo: true,
                    },
                },
            },
        });

        return NextResponse.json(
            {
                message: 'Invitation de collaboration envoyée',
                collaboration,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Create collaboration error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la création de la collaboration' },
            { status: 500 }
        );
    }
}
