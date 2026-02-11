import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const updateGoalSchema = z.object({
    targetAmount: z.number().min(0).optional(),
    targetItem: z.string().optional(),
    targetDate: z.string().optional().nullable(),
    label: z.string().optional(),
});

// PATCH: Mettre à jour un objectif
export async function PATCH(
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
        const existing = await prisma.userFinancialGoal.findFirst({
            where: { id, userId: user.userId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Objectif introuvable" }, { status: 404 });
        }

        const body = await request.json();
        const data = updateGoalSchema.parse(body);

        const goal = await prisma.userFinancialGoal.update({
            where: { id },
            data: {
                ...(data.targetAmount !== undefined && { targetAmount: data.targetAmount }),
                ...(data.targetItem !== undefined && { targetItem: data.targetItem }),
                ...(data.targetDate !== undefined && {
                    targetDate: data.targetDate ? new Date(data.targetDate) : null,
                }),
                ...(data.label !== undefined && { label: data.label }),
            },
            include: {
                progress: { orderBy: [{ year: "asc" }, { month: "asc" }] },
            },
        });

        return NextResponse.json({ goal });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error updating financial goal:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// DELETE: Supprimer un objectif
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

    const { id } = await params;

    try {
        const existing = await prisma.userFinancialGoal.findFirst({
            where: { id, userId: user.userId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Objectif introuvable" }, { status: 404 });
        }

        await prisma.userFinancialGoal.delete({ where: { id } });
        return NextResponse.json({ message: "Objectif supprimé" });
    } catch (error) {
        console.error("Error deleting financial goal:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
