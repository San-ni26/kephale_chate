
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getClientIP, getGeolocationFromIP, isCountryAllowed } from '@/src/lib/geolocation-server';
import { generateDeviceFingerprint } from '@/src/lib/device';
import { generateKeyPair, encryptPrivateKey } from '@/src/lib/crypto';
import { generateOTP, generateOTPExpiry } from '@/src/lib/otp';
import { sendOTPEmail } from '@/src/lib/email';
import { checkRateLimit, getRateLimitIdentifier } from '@/src/middleware/rateLimit';

const registerSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    email: z.string().email('Email invalide'),
    phone: z.string().min(10, 'Numéro de téléphone invalide'),
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
    gpsLocation: z.object({
        latitude: z.number(),
        longitude: z.number(),
    }).optional(),
});

export async function POST(request: NextRequest) {
    try {
        console.log('Starting registration process...');

        // Get client IP and check rate limit
        const clientIP = await getClientIP();

        const rateLimitId = getRateLimitIdentifier(clientIP);
        const rateLimit = checkRateLimit(rateLimitId);


        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Trop de tentatives. Veuillez réessayer plus tard.' },
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
        const validatedData = registerSchema.parse(body);

        // Get geolocation from IP
        const geoData = await getGeolocationFromIP(clientIP);

        if (!geoData) {
            return NextResponse.json(
                { error: 'Impossible de déterminer votre localisation. Veuillez activer la géolocalisation.' },
                { status: 400 }
            );
        }

        // Check if country is allowed
        if (!isCountryAllowed(geoData.country)) {
            return NextResponse.json(
                {
                    error: `L'inscription n'est pas autorisée depuis votre pays (${geoData.country}). Contactez l'administrateur.`,
                    countryCode: geoData.country,
                },
                { status: 403 }
            );
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: validatedData.email },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'Un compte avec cet email existe déjà.' },
                { status: 409 }
            );
        }

        // Generate device fingerprint
        console.log('Generating device fingerprint...');
        const deviceInfo = await generateDeviceFingerprint();

        // Generate encryption keys
        console.log('Generating encryption keys...');
        const keyPair = generateKeyPair();
        const encryptedPrivKey = encryptPrivateKey(keyPair.privateKey, validatedData.password);

        // Hash password
        const hashedPassword = await bcrypt.hash(validatedData.password, 12);

        // Generate OTP
        const otpCode = generateOTP();
        const otpExpiry = generateOTPExpiry();

        // Prepare location data
        const locationData = {
            ip: geoData.ip,
            country: geoData.country,
            city: geoData.city,
            region: geoData.region,
            latitude: geoData.latitude,
            longitude: geoData.longitude,
            timezone: geoData.timezone,
        };

        // Add GPS location if provided
        const currentLocation = validatedData.gpsLocation ? {
            latitude: validatedData.gpsLocation.latitude,
            longitude: validatedData.gpsLocation.longitude,
            timestamp: new Date().toISOString(),
        } : null;

        // Create user
        console.log('Attempting to create user in database...');
        try {
            const user = await prisma.user.create({
                data: {
                    name: validatedData.name,
                    email: validatedData.email,
                    phone: validatedData.phone,
                    password: hashedPassword,
                    publicKey: keyPair.publicKey,
                    encryptedPrivateKey: encryptedPrivKey,
                    deviceInfo: deviceInfo as any,
                    location: locationData as any,
                    currentLocation: currentLocation as any,
                    allowedCountry: geoData.country,
                    otpCode,
                    otpExpiry,
                    isVerified: false,
                    isFirstLogin: true,
                },
            });
            console.log('User created successfully, ID:', user.id);

            // Send OTP email
            console.log('Sending OTP email...');
            const emailSent = await sendOTPEmail(validatedData.email, otpCode, validatedData.name);
            console.log('Email sent result:', emailSent);

            if (!emailSent) {
                console.error('Email failed to send. Deleting user...');
                // If email fails, delete the user and return error
                await prisma.user.delete({ where: { id: user.id } });
                return NextResponse.json(
                    { error: 'Erreur lors de l\'envoi de l\'email de vérification. Veuillez réessayer.' },
                    { status: 500 }
                );
            }

            return NextResponse.json(
                {
                    message: 'Inscription réussie ! Un code de vérification a été envoyé à votre email.',
                    userId: user.id,
                    email: user.email,
                },
                {
                    status: 201,
                    headers: {
                        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                    }
                }
            );

        } catch (dbError) {
            console.error('Database creation error:', dbError);
            throw dbError;
        }
    } catch (error) {
        console.error('Registration error details:', error);
        if (error instanceof Error) {
            console.error('Stack trace:', error.stack);
        }

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de l\'inscription. Veuillez réessayer.' },
            { status: 500 }
        );
    }
}
