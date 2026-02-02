import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { z } from 'zod';

const createRequestSchema = z.object({
    cardCode: z.string().length(12, 'Le code de carte doit contenir 12 chiffres'),
});

// POST: Submit organization creation request
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;


        const user = (request as AuthenticatedRequest).user;

        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }
        const body = await request.json();
        const validatedData = createRequestSchema.parse(body);

        // Check if user already has a pending request
        const existingRequest = await prisma.organizationRequest.findFirst({
            where: {
                userId: user.userId,
                status: 'PENDING',
            },
        });

        if (existingRequest) {
            return NextResponse.json(
                { error: 'Vous avez déjà une demande en attente' },
                { status: 400 }
            );
        }

        // Create the request
        const orgRequest = await prisma.organizationRequest.create({
            data: {
                userId: user.userId,
                cardCode: validatedData.cardCode,
                status: 'PENDING',
            },
        });

        return NextResponse.json(
            {
                message: 'Demande envoyée avec succès',
                request: orgRequest,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Create organization request error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la création de la demande' },
            { status: 500 }
        );
    }
}

// GET: Get user's organization requests
export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const requests = await prisma.organizationRequest.findMany({
            where: {
                userId: user.userId,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return NextResponse.json({ requests }, { status: 200 });

    } catch (error) {
        console.error('Get organization requests error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des demandes' },
            { status: 500 }
        );
    }
}
