import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
        }

        const userId = payload.userId;
        const { id: orgId } = await params;

        // Get organization with user's role
        const organization = await prisma.organization.findUnique({
            where: { id: orgId },
            include: {
                subscription: true,
                _count: {
                    select: {
                        members: true,
                        departments: true,
                        events: true,
                    },
                },
            },
        });

        if (!organization) {
            return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });
        }

        // Get user's role in the organization
        const userMember = await prisma.organizationMember.findFirst({
            where: {
                userId,
                orgId,
            },
            select: {
                role: true,
            },
        });

        if (!userMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        return NextResponse.json(
            {
                organization,
                userRole: userMember.role,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Get organization error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
