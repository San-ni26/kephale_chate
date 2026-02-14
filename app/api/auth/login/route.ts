import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generateDeviceFingerprint, compareDevices, parseDeviceInfo } from '@/src/lib/device';
import { generateToken } from '@/src/lib/jwt';
import { checkRateLimitAsync, getRateLimitIdentifier } from '@/src/middleware/rateLimit';
import { getClientIP } from '@/src/lib/geolocation-server';

const loginSchema = z.object({
    email: z.string().email('Email invalide'),
    password: z.string().min(1, 'Mot de passe requis'),
});

export async function POST(request: NextRequest) {
    try {
        // Get client IP and check rate limit
        const clientIP = await getClientIP();
        const rateLimitId = getRateLimitIdentifier(clientIP);
        const rateLimit = await checkRateLimitAsync(rateLimitId);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Trop de tentatives de connexion. Veuillez réessayer plus tard.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
                    }
                }
            );
        }

        // Parse and validate request body
        const body = await request.json();
        const validatedData = loginSchema.parse(body);

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: validatedData.email },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Email ou mot de passe incorrect.' },
                { status: 401 }
            );
        }

        // Check if user is banned
        if (user.isBanned) {
            return NextResponse.json(
                { error: 'Votre compte a été suspendu. Contactez l\'administrateur.' },
                { status: 403 }
            );
        }

        // Check if email is verified
        if (!user.isVerified) {
            return NextResponse.json(
                { error: 'Veuillez vérifier votre email avant de vous connecter.' },
                { status: 403 }
            );
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(validatedData.password, user.password);

        if (!passwordMatch) {
            return NextResponse.json(
                { error: 'Email ou mot de passe incorrect.' },
                { status: 401 }
            );
        }

        // Get current device fingerprint
        const currentDevice = await generateDeviceFingerprint();

        // Check device compatibility
        if (user.isFirstLogin) {
            // First login - register this device
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    deviceId: currentDevice.deviceId,
                    deviceInfo: currentDevice as any,
                    isFirstLogin: false,
                    isOnline: true,
                    lastSeen: new Date(),
                },
            });
        } else {
            // Not first login - verify device
            const storedDevice = parseDeviceInfo(user.deviceInfo);
            /*
                        if (!storedDevice || !compareDevices(currentDevice, storedDevice)) {
                            return NextResponse.json(
                                {
                                    error: 'Appareil non reconnu. Vous ne pouvez vous connecter que depuis votre appareil enregistré.',
                                    deviceMismatch: true,
                                    hint: 'Utilisez l\'option "Changer d\'appareil" dans les paramètres depuis votre appareil principal.',
                                },
                                { status: 403 }
                            );
                        }
            */
            // Update last seen
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    isOnline: true,
                    lastSeen: new Date(),
                },
            });
        }

        // Generate JWT token
        const token = generateToken({
            userId: user.id,
            email: user.email,
            name: user.name || undefined,
            role: user.role,
        });

        const response = NextResponse.json(
            {
                message: 'Connexion réussie !',
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    phone: user.phone,
                    role: user.role,
                    publicKey: user.publicKey,
                    encryptedPrivateKey: user.encryptedPrivateKey,
                    canPublishNotifications: user.canPublishNotifications,
                },
            },
            {
                status: 200,
                headers: {
                    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                }
            }
        );

        // Cookie HttpOnly pour protection XSS (le client reçoit aussi le token en JSON pour rétrocompatibilité)
        const isProd = process.env.NODE_ENV === 'production';
        response.cookies.set('auth-token', token, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60, // 7 jours
            path: '/',
        });

        return response;

    } catch (error) {
        console.error('Login error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la connexion. Veuillez réessayer.' },
            { status: 500 }
        );
    }
}
