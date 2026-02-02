import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { z } from 'zod';
import { generateOTP, generateOTPExpiry } from '@/src/lib/otp';
import { sendOTPEmail } from '@/src/lib/email';

const resendOTPSchema = z.object({
    email: z.string().email('Email invalide'),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validatedData = resendOTPSchema.parse(body);

        // Find user
        const user = await prisma.user.findUnique({
            where: { email: validatedData.email },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé.' },
                { status: 404 }
            );
        }

        if (user.isVerified) {
            return NextResponse.json(
                { error: 'Ce compte est déjà vérifié.' },
                { status: 400 }
            );
        }

        // Generate new OTP
        const otpCode = generateOTP();
        const otpExpiry = generateOTPExpiry();

        // Update user with new OTP
        await prisma.user.update({
            where: { id: user.id },
            data: {
                otpCode,
                otpExpiry,
            },
        });

        // Send OTP email
        const emailSent = await sendOTPEmail(user.email, otpCode, user.name || undefined);

        if (!emailSent) {
            return NextResponse.json(
                { error: 'Erreur lors de l\'envoi de l\'email.' },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { message: 'Un nouveau code de vérification a été envoyé à votre email.' },
            { status: 200 }
        );

    } catch (error) {
        console.error('Resend OTP error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de l\'envoi du code.' },
            { status: 500 }
        );
    }
}
