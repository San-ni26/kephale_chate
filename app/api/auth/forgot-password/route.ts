import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { z } from 'zod';
import { generateOTP, generateOTPExpiry } from '@/src/lib/otp';
import { sendPasswordResetOTPEmail } from '@/src/lib/email';
import { checkRateLimitAsync, getRateLimitIdentifier } from '@/src/middleware/rateLimit';
import { getClientIP } from '@/src/lib/geolocation-server';

const forgotPasswordSchema = z.object({
    email: z.string().email('Email invalide'),
});

export async function POST(request: NextRequest) {
    try {
        const clientIP = await getClientIP();
        const rateLimitId = getRateLimitIdentifier(clientIP);
        const rateLimit = await checkRateLimitAsync(`forgot-password:${rateLimitId}`);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Trop de demandes. Veuillez réessayer dans quelques minutes.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
                    },
                }
            );
        }

        const body = await request.json();
        const validatedData = forgotPasswordSchema.parse(body);

        const user = await prisma.user.findUnique({
            where: { email: validatedData.email },
        });

        // Pour des raisons de sécurité, on ne révèle pas si l'email existe ou non
        if (!user) {
            return NextResponse.json(
                {
                    message: 'Si un compte existe avec cet email, un code de réinitialisation vous a été envoyé.',
                },
                { status: 200 }
            );
        }

        if (!user.isVerified) {
            return NextResponse.json(
                {
                    message: 'Si un compte existe avec cet email, un code de réinitialisation vous a été envoyé.',
                },
                { status: 200 }
            );
        }

        if (user.isBanned) {
            return NextResponse.json(
                { error: 'Ce compte a été suspendu. Contactez l\'administrateur.' },
                { status: 403 }
            );
        }

        const otpCode = generateOTP();
        const otpExpiry = generateOTPExpiry();

        await prisma.user.update({
            where: { id: user.id },
            data: {
                otpCode,
                otpExpiry,
            },
        });

        const emailSent = await sendPasswordResetOTPEmail(
            user.email,
            otpCode,
            user.name || undefined
        );

        if (!emailSent) {
            return NextResponse.json(
                { error: "Erreur lors de l'envoi de l'email. Veuillez réessayer plus tard." },
                { status: 500 }
            );
        }

        return NextResponse.json(
            {
                message:
                    'Si un compte existe avec cet email, un code de réinitialisation vous a été envoyé.',
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Forgot password error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Email invalide', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la demande. Veuillez réessayer.' },
            { status: 500 }
        );
    }
}
