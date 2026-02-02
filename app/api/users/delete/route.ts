import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const deleteAccountSchema = z.object({
    password: z.string().min(1, 'Mot de passe requis pour confirmer'),
    confirmation: z.string().refine((val) => val === "SUPPRIMER", { message: "Veuillez taper \"SUPPRIMER\" pour confirmer" }),
});

// DELETE: Delete user account
export async function DELETE(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const validatedData = deleteAccountSchema.parse(body);

        // Get user with password
        const currentUser = await prisma.user.findUnique({
            where: { id: user.userId },
        });

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // Check if user is banned (keep data if banned)
        if (currentUser.isBanned) {
            return NextResponse.json(
                { error: 'Votre compte est banni. Contactez l\'administrateur pour plus d\'informations.' },
                { status: 403 }
            );
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(
            validatedData.password,
            currentUser.password
        );

        if (!passwordMatch) {
            return NextResponse.json(
                { error: 'Mot de passe incorrect' },
                { status: 401 }
            );
        }

        // Delete user (cascade will delete related data)
        await prisma.user.delete({
            where: { id: user.userId },
        });

        return NextResponse.json(
            { message: 'Compte supprimé avec succès' },
            { status: 200 }
        );

    } catch (error) {
        console.error('Delete account error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la suppression du compte' },
            { status: 500 }
        );
    }
}
