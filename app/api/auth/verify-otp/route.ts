import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { z } from 'zod';
import { verifyOTP } from '@/src/lib/otp';
import { sendWelcomeEmail } from '@/src/lib/email';

const verifyOTPSchema = z.object({
    email: z.string().email('Email invalide'),
    otpCode: z.string().length(6, 'Le code OTP doit contenir 6 chiffres'),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validatedData = verifyOTPSchema.parse(body);

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: validatedData.email },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé.' },
                { status: 404 }
            );
        }

        // Check if already verified
        if (user.isVerified) {
            return NextResponse.json(
                { error: 'Ce compte est déjà vérifié.' },
                { status: 400 }
            );
        }

        // Verify OTP
        const otpVerification = verifyOTP(
            validatedData.otpCode,
            user.otpCode,
            user.otpExpiry
        );

        if (!otpVerification.valid) {
            return NextResponse.json(
                { error: otpVerification.error },
                { status: 400 }
            );
        }

        // Update user as verified
        await prisma.user.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                otpCode: null,
                otpExpiry: null,
            },
        });

        // Send welcome email
        await sendWelcomeEmail(user.email, user.name || 'Utilisateur');

        return NextResponse.json(
            {
                message: 'Email vérifié avec succès ! Vous pouvez maintenant vous connecter.',
                success: true,
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('OTP verification error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la vérification. Veuillez réessayer.' },
            { status: 500 }
        );
    }
}
