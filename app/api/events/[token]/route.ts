import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

// GET: Get event details by token (public, no auth required)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;
        const event = await prisma.eventInvitation.findUnique({
            where: { token },
            include: {
                organization: {
                    select: {
                        name: true,
                        logo: true,
                    },
                },
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

        // Don't expose sensitive data
        const publicEvent = {
            id: event.id,
            title: event.title,
            description: event.description,
            eventType: event.eventType,
            eventDate: event.eventDate,
            maxAttendees: event.maxAttendees,
            imageUrl: event.imageUrl,
            organization: event.organization,
            rsvpCount: event._count.rsvps,
            isFull: event._count.rsvps >= event.maxAttendees,
        };

        return NextResponse.json({ event: publicEvent }, { status: 200 });

    } catch (error) {
        console.error('Get public event error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération de l\'événement' },
            { status: 500 }
        );
    }
}
