import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';

const createAnnouncementSchema = z.object({
    title: z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
    content: z.string().min(10, 'Le contenu doit contenir au moins 10 caractères'),
});

// GET: Get active announcements
export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const now = new Date();

        // Get active announcements that haven't expired
        const announcements = await prisma.announcement.findMany({
            where: {
                isActive: true,
                expiresAt: {
                    gt: now,
                },
            },
            include: {
                publisher: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                reads: {
                    where: {
                        userId: user.userId,
                    },
                },
                _count: {
                    select: {
                        reads: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return NextResponse.json({ announcements }, { status: 200 });

    } catch (error) {
        console.error('Get announcements error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des annonces' },
            { status: 500 }
        );
    }
}

// POST: Create a new announcement (authorized users only)
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        // Check if user has permission to publish announcements
        const userData = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { canPublishNotifications: true },
        });

        if (!userData?.canPublishNotifications) {
            return NextResponse.json(
                { error: 'Vous n\'avez pas la permission de publier des annonces' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const validatedData = createAnnouncementSchema.parse(body);

        // Set expiry to 24 hours from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        const announcement = await prisma.announcement.create({
            data: {
                title: validatedData.title,
                content: validatedData.content,
                publisherId: user.userId,
                expiresAt,
            },
            include: {
                publisher: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        return NextResponse.json(
            {
                message: 'Annonce publiée avec succès',
                announcement,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Create announcement error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la publication de l\'annonce' },
            { status: 500 }
        );
    }
}

// PATCH: Mark announcement as read
export async function PATCH(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const { announcementId } = body;

        if (!announcementId) {
            return NextResponse.json(
                { error: 'ID de l\'annonce requis' },
                { status: 400 }
            );
        }

        // Create or update read record
        await prisma.announcementRead.upsert({
            where: {
                announcementId_userId: {
                    announcementId,
                    userId: user.userId,
                },
            },
            create: {
                announcementId,
                userId: user.userId,
            },
            update: {
                readAt: new Date(),
            },
        });

        return NextResponse.json(
            { message: 'Annonce marquée comme lue' },
            { status: 200 }
        );

    } catch (error) {
        console.error('Mark announcement read error:', error);
        return NextResponse.json(
            { error: 'Erreur lors du marquage de l\'annonce' },
            { status: 500 }
        );
    }
}
