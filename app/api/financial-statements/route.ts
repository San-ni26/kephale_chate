import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const upsertStatementSchema = z.object({
    year: z.number().min(2020).max(2050),
    month: z.number().min(1).max(12),
    salaryReceived: z.number().min(0),
    supplementaryIncome: z.number().min(0),
    totalExpenses: z.number().min(0),
    notes: z.string().optional(),
});

// GET: Liste des relevés mensuels
export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");

    try {
        const statements = await prisma.userMonthlyStatement.findMany({
            where: {
                userId: user.userId,
                ...(year ? { year: parseInt(year) } : {}),
            },
            orderBy: [{ year: "desc" }, { month: "desc" }],
        });

        return NextResponse.json({ statements });
    } catch (error) {
        console.error("Error fetching statements:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// POST: Créer ou mettre à jour un relevé mensuel
export async function POST(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const data = upsertStatementSchema.parse(body);

        const statement = await prisma.userMonthlyStatement.upsert({
            where: {
                userId_year_month: {
                    userId: user.userId,
                    year: data.year,
                    month: data.month,
                },
            },
            create: {
                userId: user.userId,
                year: data.year,
                month: data.month,
                salaryReceived: data.salaryReceived,
                supplementaryIncome: data.supplementaryIncome,
                totalExpenses: data.totalExpenses,
                notes: data.notes || null,
            },
            update: {
                salaryReceived: data.salaryReceived,
                supplementaryIncome: data.supplementaryIncome,
                totalExpenses: data.totalExpenses,
                notes: data.notes || null,
            },
        });

        return NextResponse.json({ statement }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error saving statement:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
