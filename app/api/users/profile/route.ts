import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { encryptPrivateKey } from '@/src/lib/crypto';

const updateProfileSchema = z.object({
    name: z.string().min(2).optional(),
    phone: z.string().min(10).optional(),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: z.string().min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères'),
});

// GET: Get user profile
export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const profile = await prisma.user.findUnique({
            where: { id: user.userId },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                publicKey: true,
                encryptedPrivateKey: true,
                deviceInfo: true,
                location: true,
                allowedCountry: true,
                role: true,
                canPublishNotifications: true,
                isOnline: true,
                lastSeen: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ profile }, { status: 200 });

    } catch (error) {
        console.error('Get profile error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération du profil' },
            { status: 500 }
        );
    }
}

// PATCH: Update user profile
export async function PATCH(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const { action } = body;

        if (action === 'update-info') {
            const validatedData = updateProfileSchema.parse(body);

            const updatedUser = await prisma.user.update({
                where: { id: user.userId },
                data: {
                    name: validatedData.name,
                    phone: validatedData.phone,
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    publicKey: true,
                },
            });

            return NextResponse.json(
                {
                    message: 'Profil mis à jour avec succès',
                    user: updatedUser,
                },
                { status: 200 }
            );

        } else if (action === 'change-password') {
            const validatedData = changePasswordSchema.parse(body);

            // Get current user with password
            const currentUser = await prisma.user.findUnique({
                where: { id: user.userId },
            });

            if (!currentUser) {
                return NextResponse.json(
                    { error: 'Utilisateur non trouvé' },
                    { status: 404 }
                );
            }

            // Verify current password
            const passwordMatch = await bcrypt.compare(
                validatedData.currentPassword,
                currentUser.password
            );

            if (!passwordMatch) {
                return NextResponse.json(
                    { error: 'Mot de passe actuel incorrect' },
                    { status: 401 }
                );
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(validatedData.newPassword, 12);

            // Re-encrypt private key with new password
            // Note: In production, this should be done client-side
            // For now, we'll keep the same encrypted private key
            // The client should decrypt with old password and re-encrypt with new password

            await prisma.user.update({
                where: { id: user.userId },
                data: {
                    password: hashedPassword,
                },
            });

            return NextResponse.json(
                { message: 'Mot de passe modifié avec succès' },
                { status: 200 }
            );

        } else {
            return NextResponse.json(
                { error: 'Action invalide' },
                { status: 400 }
            );
        }

    } catch (error) {
        console.error('Update profile error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour du profil' },
            { status: 500 }
        );
    }
}
