import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';
import { generateKeyPair } from '@/src/lib/crypto';

export const dynamic = 'force-dynamic';

const createGroupSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
});

// GET: Liste des groupes d'une collaboration
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, collab: collabId } = await params;

        const collaboration = await prisma.organizationCollaboration.findFirst({
            where: {
                id: collabId,
                OR: [{ orgAId: orgId }, { orgBId: orgId }],
            },
        });

        if (!collaboration) {
            return NextResponse.json(
                { error: 'Collaboration non trouvée' },
                { status: 404 }
            );
        }

        const membership = await prisma.organizationMember.findFirst({
            where: {
                userId: user.userId,
                orgId: { in: [collaboration.orgAId, collaboration.orgBId] },
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Accès refusé' },
                { status: 403 }
            );
        }

        const groups = await prisma.collaborationGroup.findMany({
            where: { collaborationId: collabId },
            include: {
                _count: { select: { members: true } },
                members: {
                    where: { userId: user.userId },
                    select: { id: true },
                },
            },
        });

        return NextResponse.json({ groups }, { status: 200 });
    } catch (error) {
        console.error('Get collaboration groups error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des groupes' },
            { status: 500 }
        );
    }
}

// POST: Créer un groupe dans une collaboration (admin des deux orgs)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collab: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, collab: collabId } = await params;

        const collaboration = await prisma.organizationCollaboration.findFirst({
            where: {
                id: collabId,
                OR: [{ orgAId: orgId }, { orgBId: orgId }],
            },
        });

        if (!collaboration) {
            return NextResponse.json(
                { error: 'Collaboration non trouvée' },
                { status: 404 }
            );
        }

        if (collaboration.status !== 'ACTIVE') {
            return NextResponse.json(
                { error: 'La collaboration doit être active pour créer des groupes' },
                { status: 400 }
            );
        }

        const adminMembership = await prisma.organizationMember.findFirst({
            where: {
                userId: user.userId,
                orgId: { in: [collaboration.orgAId, collaboration.orgBId] },
                role: { in: ['OWNER', 'ADMIN'] },
            },
        });

        if (!adminMembership) {
            return NextResponse.json(
                { error: 'Seuls les administrateurs des deux organisations peuvent créer des groupes' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const validatedData = createGroupSchema.parse(body);

        const deptKeyPair = generateKeyPair();

        const creatorOrgId = adminMembership.orgId;

        const group = await prisma.collaborationGroup.create({
            data: {
                collaborationId: collabId,
                name: validatedData.name,
                publicKey: deptKeyPair.publicKey,
                members: {
                    create: {
                        userId: user.userId,
                        orgId: creatorOrgId,
                        encryptedDeptKey: deptKeyPair.privateKey,
                    },
                },
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });

        // Créer la conversation par défaut pour le groupe
        await prisma.group.create({
            data: {
                name: `${validatedData.name} - Discussion`,
                isDirect: false,
                collaborationGroupId: group.id,
                members: {
                    create: {
                        userId: user.userId,
                    },
                },
            },
        });

        return NextResponse.json(
            {
                message: 'Groupe créé avec succès',
                group,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Create collaboration group error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la création du groupe' },
            { status: 500 }
        );
    }
}
