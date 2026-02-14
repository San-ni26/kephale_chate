import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { checkRateLimitAsync, getRateLimitIdentifier } from '@/src/middleware/rateLimit';
import { getClientIP } from '@/src/lib/geolocation-server';
import { z } from 'zod';

const createRSVPSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    phone: z.string().min(10, 'Le numéro de téléphone doit contenir au moins 10 chiffres'),
});

// POST: Submit RSVP (public, no auth required - rate limited)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const clientIP = await getClientIP();
        const rateLimitId = getRateLimitIdentifier(clientIP);
        const rateLimit = await checkRateLimitAsync(`rsvp:${rateLimitId}`);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Trop de tentatives. Veuillez réessayer plus tard.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
                    },
                }
            );
        }

        const { token } = await params;
        const body = await request.json();
        const validatedData = createRSVPSchema.parse(body);

        // Get event
        const event = await prisma.eventInvitation.findUnique({
            where: { token },
            include: {
                _count: {
                    select: {
                        rsvps: true,
                    },
                },
            },
        });

        if (!event) {
            return NextResponse.json(
                { error: 'Événement non trouvé' },
                { status: 404 }
            );
        }

        // Check if event is full
        if (event._count.rsvps >= event.maxAttendees) {
            return NextResponse.json(
                { error: 'Cet événement est complet. Aucune nouvelle inscription n\'est possible.' },
                { status: 400 }
            );
        }

        // Check if this phone number already registered
        const existingRSVP = await prisma.invitationRSVP.findFirst({
            where: {
                eventId: event.id,
                phone: validatedData.phone,
            },
        });

        if (existingRSVP) {
            return NextResponse.json(
                { error: 'Ce numéro de téléphone est déjà enregistré pour cet événement' },
                { status: 400 }
            );
        }

        // Create RSVP
        const rsvp = await prisma.invitationRSVP.create({
            data: {
                eventId: event.id,
                name: validatedData.name,
                phone: validatedData.phone,
            },
        });

        // Get updated count
        const updatedCount = await prisma.invitationRSVP.count({
            where: { eventId: event.id },
        });

        return NextResponse.json(
            {
                message: 'Votre présence a été confirmée avec succès',
                rsvp: {
                    id: rsvp.id,
                    name: rsvp.name,
                },
                rsvpCount: updatedCount,
                spotsRemaining: event.maxAttendees - updatedCount,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Create RSVP error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la confirmation de présence' },
            { status: 500 }
        );
    }
}

// GET: List RSVPs for event (organization members only)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        // Get event
        const event = await prisma.eventInvitation.findUnique({
            where: { token },
            include: {
                rsvps: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });

        if (!event) {
            return NextResponse.json(
                { error: 'Événement non trouvé' },
                { status: 404 }
            );
        }

        // Check if user is member of the organization
        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_orgId: {
                    userId: user.userId,
                    orgId: event.orgId,
                },
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Accès non autorisé. Seuls les membres de l\'organisation peuvent voir les RSVPs.' },
                { status: 403 }
            );
        }

        return NextResponse.json(
            {
                rsvps: event.rsvps,
                totalCount: event.rsvps.length,
                maxAttendees: event.maxAttendees,
                spotsRemaining: event.maxAttendees - event.rsvps.length,
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('Get RSVPs error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des RSVPs' },
            { status: 500 }
        );
    }
}
