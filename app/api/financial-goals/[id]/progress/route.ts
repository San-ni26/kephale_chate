import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const upsertProgressSchema = z.object({
    year: z.number().min(2020).max(2050),
    month: z.number().min(1).max(12),
    amount: z.number().min(0),
    notes: z.string().optional(),
});

// GET: Progrès mensuels d'un objectif
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const goal = await prisma.userFinancialGoal.findFirst({
            where: { id, userId: user.userId },
            include: {
                progress: { orderBy: [{ year: "asc" }, { month: "asc" }] },
            },
        });

        if (!goal) {
            return NextResponse.json({ error: "Objectif introuvable" }, { status: 404 });
        }

        return NextResponse.json({ goal });
    } catch (error) {
        console.error("Error fetching progress:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// POST: Ajouter une entrée de progrès (plusieurs entrées par mois possibles)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const goal = await prisma.userFinancialGoal.findFirst({
            where: { id, userId: user.userId },
        });

        if (!goal) {
            return NextResponse.json({ error: "Objectif introuvable" }, { status: 404 });
        }

        const body = await request.json();
        const { year, month, amount, notes } = upsertProgressSchema.parse(body);

        const progress = await prisma.userMonthlyProgress.create({
            data: {
                goalId: id,
                year,
                month,
                amount,
                notes: notes || null,
            },
        });

        return NextResponse.json({ progress }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error upserting progress:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// DELETE: Supprimer une entrée de progrès (progressId en query)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id: goalId } = await params;
    const { searchParams } = new URL(request.url);
    const progressId = searchParams.get("progressId");
    if (!progressId) {
        return NextResponse.json({ error: "progressId requis" }, { status: 400 });
    }

    try {
        const goal = await prisma.userFinancialGoal.findFirst({
            where: { id: goalId, userId: user.userId },
        });
        if (!goal) {
            return NextResponse.json({ error: "Objectif introuvable" }, { status: 404 });
        }

        const progress = await prisma.userMonthlyProgress.findFirst({
            where: { id: progressId, goalId },
        });
        if (!progress) {
            return NextResponse.json({ error: "Entrée de progrès introuvable" }, { status: 404 });
        }

        await prisma.userMonthlyProgress.delete({
            where: { id: progressId },
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting progress:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
