import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';
import { generateEventToken } from '@/src/lib/subscription';

const createEventSchema = z.object({
    title: z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
    description: z.string().optional(),
    eventType: z.enum(['PROFESSIONAL', 'DINNER', 'MEETING', 'PARTY', 'CONFERENCE', 'WORKSHOP', 'OTHER']),
    eventDate: z.string(), // ISO date string
    maxAttendees: z.number().min(1, 'Le nombre minimum de participants est 1'),
    imageUrl: z.string().nullable().optional(),
});

// GET: List all events for organization
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

        // Check if user is member of organization
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

        const events = await prisma.eventInvitation.findMany({
            where: {
                orgId,
            },
            include: {
                _count: {
                    select: {
                        rsvps: true,
                    },
                },
            },
            orderBy: {
                eventDate: 'asc',
            },
        });

        return NextResponse.json({ events }, { status: 200 });

    } catch (error) {
        console.error('Get events error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des événements' },
            { status: 500 }
        );
    }
}

// POST: Create new event invitation
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

        // Parse JSON body
        const body = await request.json();
        const validatedData = createEventSchema.parse(body);

        // Check if user is member of organization
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

        // Generate unique token for the event
        let token = generateEventToken();
        let tokenExists = await prisma.eventInvitation.findUnique({ where: { token } });




        while (tokenExists) {
            token = generateEventToken();
            tokenExists = await prisma.eventInvitation.findUnique({ where: { token } });
        }

        // Create event
        const event = await prisma.eventInvitation.create({
            data: {
                orgId,
                title: validatedData.title,
                description: validatedData.description,
                eventType: validatedData.eventType,
                eventDate: new Date(validatedData.eventDate),
                maxAttendees: validatedData.maxAttendees,
                imageUrl: validatedData.imageUrl || undefined,
                token,
                createdBy: user.userId,
            },
            include: {
                _count: {
                    select: {
                        rsvps: true,
                    },
                },
            },
        });

        // Generate invitation link
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const invitationLink = `${baseUrl}/events/${token}`;

        return NextResponse.json(
            {
                message: 'Événement créé avec succès',
                event,
                invitationLink,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Create event error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la création de l\'événement' },
            { status: 500 }
        );
    }
}
