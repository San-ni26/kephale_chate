import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireSuperAdmin, AuthenticatedRequest } from '@/src/middleware/auth';

// GET: Get all users (super admin only)
export async function GET(request: NextRequest) {
    try {
        const authError = await requireSuperAdmin(request);
        if (authError) return authError;

        const { searchParams } = new URL(request.url);
        const country = searchParams.get('country');
        const status = searchParams.get('status'); // 'online', 'offline', 'banned'
        const search = searchParams.get('search')?.trim();
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');

        const where: any = {};

        if (country) {
            where.allowedCountry = country;
        }

        if (status === 'online') {
            where.isOnline = true;
        } else if (status === 'offline') {
            where.isOnline = false;
        } else if (status === 'banned') {
            where.isBanned = true;
        }

        // Recherche par email ou nom (obligatoire pour éviter de charger tous les users)
        if (!search || search.length < 2) {
            return NextResponse.json(
                { users: [], pagination: { total: 0, page: 1, limit, totalPages: 0 } },
                { status: 200 }
            );
        }

        where.OR = [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
        ];

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    role: true,
                    isVerified: true,
                    isBanned: true,
                    isOnline: true,
                    lastSeen: true,
                    allowedCountry: true,
                    location: true,
                    currentLocation: true,
                    deviceInfo: true,
                    createdAt: true,
                    updatedAt: true,
                    canPublishNotifications: true,
                    isFirstLogin: true,
                    _count: {
                        select: {
                            sentMessages: true,
                            orgMemberships: true,
                            deptMemberships: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                take: limit,
                skip: (page - 1) * limit,
            }),
            prisma.user.count({ where }),
        ]);

        return NextResponse.json(
            {
                users,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('Get users error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des utilisateurs' },
            { status: 500 }
        );
    }
}

// PATCH: Update user (ban/unban, grant permissions)
export async function PATCH(request: NextRequest) {
    try {
        const authError = await requireSuperAdmin(request);
        if (authError) return authError;

        const body = await request.json();
        const { userId, action, value } = body;

        if (!userId || !action) {
            return NextResponse.json(
                { error: 'ID utilisateur et action requis' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        let updateData: any = {};

        switch (action) {
            case 'ban':
                updateData.isBanned = true;
                updateData.isOnline = false;
                break;

            case 'unban':
                updateData.isBanned = false;
                break;

            case 'grant-publish':
                updateData.canPublishNotifications = true;
                break;

            case 'revoke-publish':
                updateData.canPublishNotifications = false;
                break;

            case 'set-role':
                if (!['USER', 'ADMIN', 'SUPER_ADMIN'].includes(value)) {
                    return NextResponse.json(
                        { error: 'Rôle invalide' },
                        { status: 400 }
                    );
                }
                updateData.role = value;
                break;

            default:
                return NextResponse.json(
                    { error: 'Action invalide' },
                    { status: 400 }
                );
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isBanned: true,
                canPublishNotifications: true,
            },
        });

        return NextResponse.json(
            {
                message: 'Utilisateur mis à jour avec succès',
                user: updatedUser,
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('Update user error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour de l\'utilisateur' },
            { status: 500 }
        );
    }
}
