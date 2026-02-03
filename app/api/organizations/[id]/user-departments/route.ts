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

        // Get user's departments in this organization
        const userDepartments = await prisma.departmentMember.findMany({
            where: {
                userId,
                department: {
                    orgId,
                },
            },
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                        _count: {
                            select: {
                                members: true,
                            },
                        },
                    },
                },
            },
        });

        return NextResponse.json(
            { departments: userDepartments },
            { status: 200 }
        );
    } catch (error) {
        console.error('Get user departments error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
