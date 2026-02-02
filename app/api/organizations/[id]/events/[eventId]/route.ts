import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';

const updateEventSchema = z.object({
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    eventType: z.enum(['PROFESSIONAL', 'DINNER', 'MEETING', 'PARTY', 'CONFERENCE', 'WORKSHOP', 'OTHER']).optional(),
    eventDate: z.string().optional(),
    maxAttendees: z.number().min(1).optional(),
    imageUrl: z.string().optional(),
});

// GET: Get event details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; eventId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, eventId } = await params;

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

        const event = await prisma.eventInvitation.findUnique({
            where: { id: eventId },
            include: {
                rsvps: true,
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

        if (event.orgId !== orgId) {
            return NextResponse.json(
                { error: 'Cet événement n\'appartient pas à cette organisation' },
                { status: 403 }
            );
        }

        return NextResponse.json({ event }, { status: 200 });

    } catch (error) {
        console.error('Get event error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération de l\'événement' },
            { status: 500 }
        );
    }
}

// PATCH: Update event details
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; eventId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, eventId } = await params;
        const body = await request.json();
        const validatedData = updateEventSchema.parse(body);

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

        const event = await prisma.eventInvitation.findUnique({
            where: { id: eventId },
        });

        if (!event) {
            return NextResponse.json(
                { error: 'Événement non trouvé' },
                { status: 404 }
            );
        }

        if (event.orgId !== orgId) {
            return NextResponse.json(
                { error: 'Cet événement n\'appartient pas à cette organisation' },
                { status: 403 }
            );
        }

        // Only creator or org admin/owner can update
        if (event.createdBy !== user.userId && membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Seul le créateur ou un administrateur peut modifier cet événement' },
                { status: 403 }
            );
        }

        const updatedEvent = await prisma.eventInvitation.update({
            where: { id: eventId },
            data: {
                ...(validatedData.title && { title: validatedData.title }),
                ...(validatedData.description !== undefined && { description: validatedData.description }),
                ...(validatedData.eventType && { eventType: validatedData.eventType }),
                ...(validatedData.eventDate && { eventDate: new Date(validatedData.eventDate) }),
                ...(validatedData.maxAttendees && { maxAttendees: validatedData.maxAttendees }),
                ...(validatedData.imageUrl !== undefined && { imageUrl: validatedData.imageUrl }),
            },
            include: {
                _count: {
                    select: {
                        rsvps: true,
                    },
                },
            },
        });

        return NextResponse.json(
            {
                message: 'Événement mis à jour avec succès',
                event: updatedEvent,
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('Update event error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour de l\'événement' },
            { status: 500 }
        );
    }
}

// DELETE: Delete event
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; eventId: string }> }
) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id: orgId, eventId } = await params;

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

        const event = await prisma.eventInvitation.findUnique({
            where: { id: eventId },
        });

        if (!event) {
            return NextResponse.json(
                { error: 'Événement non trouvé' },
                { status: 404 }
            );
        }

        if (event.orgId !== orgId) {
            return NextResponse.json(
                { error: 'Cet événement n\'appartient pas à cette organisation' },
                { status: 403 }
            );
        }

        // Only creator or org admin/owner can delete
        if (event.createdBy !== user.userId && membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Seul le créateur ou un administrateur peut supprimer cet événement' },
                { status: 403 }
            );
        }

        await prisma.eventInvitation.delete({
            where: { id: eventId },
        });

        return NextResponse.json(
            { message: 'Événement supprimé avec succès' },
            { status: 200 }
        );

    } catch (error) {
        console.error('Delete event error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la suppression de l\'événement' },
            { status: 500 }
        );
    }
}
