import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const updateProfileSchema = z.object({
    monthlySalary: z.number().min(0),
    supplementaryIncome: z.number().min(0),
    currency: z.string().optional(),
    preferredSavingsRate: z.number().min(0).max(100).optional().nullable(),
});

// GET: Profil financier
export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    try {
        const profile = await prisma.userFinancialProfile.findUnique({
            where: { userId: user.userId },
        });

        return NextResponse.json({ profile: profile || null });
    } catch (error) {
        console.error("Error fetching financial profile:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// POST/PUT: Créer ou mettre à jour le profil financier
export async function POST(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const data = updateProfileSchema.parse(body);

        const profile = await prisma.userFinancialProfile.upsert({
            where: { userId: user.userId },
            create: {
                userId: user.userId,
                monthlySalary: data.monthlySalary,
                supplementaryIncome: data.supplementaryIncome,
                currency: data.currency || "FCFA",
                preferredSavingsRate: data.preferredSavingsRate ?? 20,
            },
            update: {
                monthlySalary: data.monthlySalary,
                supplementaryIncome: data.supplementaryIncome,
                ...(data.currency && { currency: data.currency }),
                ...(data.preferredSavingsRate !== undefined && {
                    preferredSavingsRate: data.preferredSavingsRate,
                }),
            },
        });

        return NextResponse.json({ profile }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error saving financial profile:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// PATCH: Mise à jour partielle
export async function PATCH(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const data = updateProfileSchema.partial().parse(body);

        const profile = await prisma.userFinancialProfile.upsert({
            where: { userId: user.userId },
            create: {
                userId: user.userId,
                monthlySalary: data.monthlySalary ?? 0,
                supplementaryIncome: data.supplementaryIncome ?? 0,
                currency: data.currency ?? "FCFA",
                preferredSavingsRate: data.preferredSavingsRate ?? 20,
            },
            update: {
                ...(data.monthlySalary !== undefined && { monthlySalary: data.monthlySalary }),
                ...(data.supplementaryIncome !== undefined && {
                    supplementaryIncome: data.supplementaryIncome,
                }),
                ...(data.currency && { currency: data.currency }),
                ...(data.preferredSavingsRate !== undefined && {
                    preferredSavingsRate: data.preferredSavingsRate,
                }),
            },
        });

        return NextResponse.json({ profile });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error updating financial profile:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
