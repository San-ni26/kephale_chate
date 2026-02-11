import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const createGoalSchema = z.object({
    type: z.enum(["ANNUAL_SAVINGS", "MATERIAL_PURCHASE"]),
    year: z.number().min(2020).max(2050).optional(),
    targetItem: z.string().optional(),
    targetAmount: z.number().min(0),
    targetDate: z.string().optional(),
    label: z.string().optional(),
});

// GET: Liste des objectifs financiers
export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const type = searchParams.get("type");

    try {
        const goals = await prisma.userFinancialGoal.findMany({
            where: {
                userId: user.userId,
                ...(year && !type ? { year: parseInt(year) } : type === "ANNUAL_SAVINGS" && year ? { year: parseInt(year) } : {}),
                ...(type ? { type: type as "ANNUAL_SAVINGS" | "MATERIAL_PURCHASE" } : {}),
            },
            include: {
                progress: {
                    orderBy: [{ year: "asc" }, { month: "asc" }],
                },
            },
            orderBy: [{ type: "asc" }, { year: "desc" }],
        });

        return NextResponse.json({ goals });
    } catch (error) {
        console.error("Error fetching financial goals:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// POST: Créer un objectif financier
export async function POST(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const data = createGoalSchema.parse(body);

        if (data.type === "ANNUAL_SAVINGS") {
            if (!data.year) {
                return NextResponse.json(
                    { error: "L'année est requise pour un objectif d'épargne annuelle" },
                    { status: 400 }
                );
            }
            const existing = await prisma.userFinancialGoal.findFirst({
                where: {
                    userId: user.userId,
                    type: "ANNUAL_SAVINGS",
                    year: data.year,
                },
            });
            if (existing) {
                return NextResponse.json(
                    { error: "Un objectif d'épargne existe déjà pour cette année" },
                    { status: 400 }
                );
            }
        }

        const goal = await prisma.userFinancialGoal.create({
            data: {
                userId: user.userId,
                type: data.type,
                year: data.type === "ANNUAL_SAVINGS" ? data.year : null,
                targetItem: data.type === "MATERIAL_PURCHASE" ? (data.targetItem || "Bien") : null,
                targetAmount: data.targetAmount,
                targetDate: data.targetDate ? new Date(data.targetDate) : null,
                label: data.label || (data.type === "MATERIAL_PURCHASE" ? data.targetItem : `Objectif ${data.year}`),
            },
            include: {
                progress: true,
            },
        });

        return NextResponse.json({ goal }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error creating financial goal:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
