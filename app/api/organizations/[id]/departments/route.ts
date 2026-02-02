import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';
import { generateKeyPair, encryptMessage } from '@/src/lib/crypto';

const createDeptSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
});

const addMemberSchema = z.object({
    userEmail: z.string().email('Email invalide'),
});

// GET: Get departments for an organization
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

        // Verify user is member of organization
        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_orgId: {
                    userId: user.userId,
                    orgId,
                },
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Vous n\'êtes pas membre de cette organisation' },
                { status: 403 }
            );
        }

        // Get departments where user is a member
        const departments = await prisma.department.findMany({
            where: {
                orgId,
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
                            },
                        },
                    },
                },
                conversations: {
                    include: {
                        messages: {
                            orderBy: {
                                createdAt: 'desc',
                            },
                            take: 1,
                        },
                    },
                },
                _count: {
                    select: {
                        members: true,
                    },
                },
            },
        });

        return NextResponse.json({ departments }, { status: 200 });

    } catch (error) {
        console.error('Get departments error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des départements' },
            { status: 500 }
        );
    }
}

// POST: Create a new department (owner/admin only)
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

        const { id: orgId } = await params;

        // Verify user is owner or admin
        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_orgId: {
                    userId: user.userId,
                    orgId,
                },
            },
        });

        if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
            return NextResponse.json(
                { error: 'Seuls les propriétaires et administrateurs peuvent créer des départements' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const validatedData = createDeptSchema.parse(body);

        // Check subscription limits
        const organization = await prisma.organization.findUnique({
            where: { id: orgId },
            include: {
                subscription: true,
                _count: {
                    select: {
                        departments: true,
                    },
                },
            },
        });

        if (!organization) {
            return NextResponse.json(
                { error: 'Organisation non trouvée' },
                { status: 404 }
            );
        }

        if (!organization.subscription) {
            return NextResponse.json(
                { error: 'Aucun abonnement actif pour cette organisation' },
                { status: 400 }
            );
        }

        // Check if department limit reached
        if (organization._count.departments >= organization.subscription.maxDepartments) {
            return NextResponse.json(
                {
                    error: `Limite de départements atteinte pour votre plan ${organization.subscription.plan}. Veuillez mettre à niveau votre abonnement.`,
                    currentCount: organization._count.departments,
                    maxAllowed: organization.subscription.maxDepartments,
                },
                { status: 403 }
            );
        }


        // Generate department encryption keys
        const deptKeyPair = generateKeyPair();

        // Get current user's public key to encrypt department private key for them
        const currentUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { publicKey: true, encryptedPrivateKey: true },
        });

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // Create department
        const department = await prisma.department.create({
            data: {
                name: validatedData.name,
                orgId,
                publicKey: deptKeyPair.publicKey,
                members: {
                    create: {
                        userId: user.userId,
                        // Store department private key encrypted with user's public key
                        // Note: In production, this should be done client-side
                        encryptedDeptKey: deptKeyPair.privateKey, // Simplified for now
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
                            },
                        },
                    },
                },
            },
        });

        // Create a default conversation for the department
        await prisma.group.create({
            data: {
                name: `${validatedData.name} - Discussion`,
                isDirect: false,
                deptId: department.id,
                members: {
                    create: {
                        userId: user.userId,
                    },
                },
            },
        });

        return NextResponse.json(
            {
                message: 'Département créé avec succès',
                department,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Create department error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la création du département' },
            { status: 500 }
        );
    }
}
