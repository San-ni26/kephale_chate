import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';

const createGroupSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    memberEmails: z.array(z.string().email()).min(1, 'Au moins un membre requis'),
});

// GET: Get user's groups
export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const groups = await prisma.group.findMany({
            where: {
                isDirect: false,
                deptId: null, // Exclude department groups
                members: {
                    some: {
                        userId: user.userId,
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
                                publicKey: true,
                                isOnline: true,
                                lastSeen: true,
                            },
                        },
                    },
                },
                messages: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 1,
                    include: {
                        sender: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        members: true,
                        messages: true,
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        return NextResponse.json({ groups }, { status: 200 });

    } catch (error) {
        console.error('Get groups error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des groupes' },
            { status: 500 }
        );
    }
}

// POST: Create a new group
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const validatedData = createGroupSchema.parse(body);

        // Find users by email
        const users = await prisma.user.findMany({
            where: {
                email: {
                    in: validatedData.memberEmails,
                },
                isVerified: true,
                isBanned: false,
            },
        });

        if (users.length === 0) {
            return NextResponse.json(
                { error: 'Aucun utilisateur valide trouvé' },
                { status: 404 }
            );
        }

        // Create group with members
        const memberIds = [...new Set([user.userId, ...users.map((u: any) => u.id)])];

        const group = await prisma.group.create({
            data: {
                name: validatedData.name,
                isDirect: false,
                members: {
                    create: memberIds.map((id: any) => ({ userId: id })),
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
                                publicKey: true,
                                isOnline: true,
                                lastSeen: true,
                            },
                        },
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
        console.error('Create group error:', error);

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
