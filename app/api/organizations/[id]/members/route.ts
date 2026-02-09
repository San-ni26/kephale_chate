import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';

/**
 * GET: List all members of the organization (id, name, email) for event invitations etc.
 */
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

        const members = await prisma.organizationMember.findMany({
            where: { orgId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        const list = members.map((m) => ({
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            role: m.role,
        }));

        return NextResponse.json({ members: list }, { status: 200 });
    } catch (error) {
        console.error('Get organization members error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des membres' },
            { status: 500 }
        );
    }
}
