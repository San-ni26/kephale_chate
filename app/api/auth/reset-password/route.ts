import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { verifyOTP } from '@/src/lib/otp';
import { checkRateLimit, getRateLimitIdentifier } from '@/src/middleware/rateLimit';
import { getClientIP } from '@/src/lib/geolocation-server';

const resetPasswordSchema = z
    .object({
        email: z.string().email('Email invalide'),
        otpCode: z.string().length(6, 'Le code OTP doit contenir 6 chiffres'),
        newPassword: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
        confirmPassword: z.string().min(1, 'Confirmez le mot de passe'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: 'Les mots de passe ne correspondent pas',
        path: ['confirmPassword'],
    });

export async function POST(request: NextRequest) {
    try {
        const clientIP = await getClientIP();
        const rateLimitId = getRateLimitIdentifier(clientIP);
        const rateLimit = checkRateLimit(`reset-password:${rateLimitId}`);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Trop de tentatives. Veuillez réessayer dans quelques minutes.' },
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
        const validatedData = resetPasswordSchema.parse(body);

        const user = await prisma.user.findUnique({
            where: { email: validatedData.email },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Email ou code OTP invalide.' },
                { status: 400 }
            );
        }

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

        const hashedPassword = await bcrypt.hash(validatedData.newPassword, 12);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                otpCode: null,
                otpExpiry: null,
            },
        });

        return NextResponse.json(
            {
                message: 'Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.',
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Reset password error:', error);

        if (error instanceof z.ZodError) {
            const firstError = error.issues[0];
            const message =
                firstError?.path?.join('.') === 'confirmPassword'
                    ? firstError.message
                    : error.issues.map((i) => i.message).join(', ');
            return NextResponse.json({ error: message }, { status: 400 });
        }

        return NextResponse.json(
            { error: 'Erreur lors de la réinitialisation. Veuillez réessayer.' },
            { status: 500 }
        );
    }
}
