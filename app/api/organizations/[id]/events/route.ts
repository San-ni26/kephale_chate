import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';
import { generateEventToken } from '@/src/lib/subscription';
import { sendEventInvitationEmail } from '@/src/lib/email';

const sendInvitationsSchema = z.object({
    target: z.enum(['all', 'department', 'selected']),
    departmentId: z.string().optional(),
    userIds: z.array(z.string()).optional(),
}).optional();

const broadcastToDepartmentsSchema = z.union([
    z.literal('all'),
    z.array(z.string()).min(1, 'Au moins un département requis'),
]).optional();

const createEventSchema = z.object({
    title: z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
    description: z.string().optional(),
    eventType: z.enum(['PROFESSIONAL', 'DINNER', 'MEETING', 'PARTY', 'CONFERENCE', 'WORKSHOP', 'OTHER']),
    eventDate: z.string(), // ISO date string
    maxAttendees: z.number().min(1, 'Le nombre minimum de participants est 1'),
    imageUrl: z.string().nullable().optional(),
    sendInvitations: sendInvitationsSchema,
    broadcastToDepartments: broadcastToDepartmentsSchema,
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

        // Broadcast event to department discussions (affichage jusqu'à fin d'événement ou suppression)
        const broadcastToDepartments = validatedData.broadcastToDepartments;
        if (broadcastToDepartments) {
            const deptIds =
                broadcastToDepartments === 'all'
                    ? (await prisma.department.findMany({ where: { orgId }, select: { id: true } })).map((d) => d.id)
                    : broadcastToDepartments;
            const validDeptIds = await prisma.department.findMany({
                where: { id: { in: deptIds }, orgId },
                select: { id: true },
            });
            if (validDeptIds.length > 0) {
                await prisma.eventDepartmentBroadcast.createMany({
                    data: validDeptIds.map((d) => ({ eventId: event.id, deptId: d.id })),
                    skipDuplicates: true,
                });
            }
        }

        // Generate invitation link
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const invitationLink = `${baseUrl}/events/${token}`;

        let invitationsSent = 0;
        const sendInvitations = validatedData.sendInvitations;
        if (sendInvitations?.target) {
            const org = await prisma.organization.findUnique({
                where: { id: orgId },
                select: { name: true },
            });
            const orgName = org?.name ?? 'Organisation';

            type Recipient = { email: string; name: string | null };
            let recipients: Recipient[] = [];

            if (sendInvitations.target === 'all') {
                const members = await prisma.organizationMember.findMany({
                    where: { orgId },
                    include: { user: { select: { email: true, name: true } } },
                });
                recipients = members.map((m) => ({ email: m.user.email, name: m.user.name }));
            } else if (sendInvitations.target === 'department' && sendInvitations.departmentId) {
                const dept = await prisma.department.findFirst({
                    where: { id: sendInvitations.departmentId, orgId },
                    include: {
                        members: {
                            include: { user: { select: { email: true, name: true } } },
                        },
                    },
                });
                if (dept) {
                    recipients = dept.members.map((m) => ({
                        email: m.user.email,
                        name: m.user.name,
                    }));
                }
            } else if (sendInvitations.target === 'selected' && sendInvitations.userIds?.length) {
                const users = await prisma.user.findMany({
                    where: {
                        id: { in: sendInvitations.userIds },
                        orgMemberships: { some: { orgId } },
                    },
                    select: { email: true, name: true },
                });
                recipients = users.map((u) => ({ email: u.email, name: u.name }));
            }

            const eventDetails = {
                title: event.title,
                description: event.description,
                eventType: event.eventType,
                eventDate: event.eventDate,
                maxAttendees: event.maxAttendees,
            };

            for (const r of recipients) {
                const ok = await sendEventInvitationEmail(
                    r.email,
                    r.name,
                    orgName,
                    eventDetails,
                    invitationLink
                );
                if (ok) invitationsSent++;
            }
        }

        return NextResponse.json(
            {
                message: 'Événement créé avec succès',
                event,
                invitationLink,
                ...(sendInvitations?.target ? { invitationsSent } : {}),
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
