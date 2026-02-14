import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const updateProgressSchema = z.object({
    year: z.number().min(2020).max(2050).optional(),
    month: z.number().min(1).max(12).optional(),
    amount: z.number().min(0).optional(),
    notes: z.string().optional().nullable(),
});

function getParamsFromUrl(url: string): { goalId: string; progressId: string } | null {
    const match = url.match(/\/api\/financial-goals\/([^/]+)\/progress\/([^/]+)/);
    if (!match) return null;
    return { goalId: match[1], progressId: match[2] };
}

async function resolveProgressParams(
    request: NextRequest,
    context: { params?: Promise<{ id?: string; progressId?: string }> }
): Promise<{ goalId: string; progressId: string } | NextResponse> {
    try {
        const resolved = context.params ? await context.params : null;
        if (resolved?.id && resolved?.progressId) {
            return { goalId: resolved.id, progressId: resolved.progressId };
        }
        const fromUrl = getParamsFromUrl(request.url);
        if (!fromUrl) return NextResponse.json({ error: "URL invalide" }, { status: 400 });
        return fromUrl;
    } catch {
        const fromUrl = getParamsFromUrl(request.url);
        if (!fromUrl) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
        return fromUrl;
    }
}

// PATCH: Modifier une entrée de progrès
export async function PATCH(
    request: NextRequest,
    context: { params?: Promise<{ id?: string; progressId?: string }> }
) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const paramsResult = await resolveProgressParams(request, context);
    if (paramsResult instanceof NextResponse) return paramsResult;
    const { goalId, progressId } = paramsResult;

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
            return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
        }

        const body = await request.json();
        const data = updateProgressSchema.parse(body);
        const updated = await prisma.userMonthlyProgress.update({
            where: { id: progressId },
            data: {
                ...(data.year !== undefined && { year: data.year }),
                ...(data.month !== undefined && { month: data.month }),
                ...(data.amount !== undefined && { amount: data.amount }),
                ...(data.notes !== undefined && { notes: data.notes }),
            },
        });
        return NextResponse.json({ progress: updated });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error updating progress:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// DELETE: Supprimer une entrée de progrès
export async function DELETE(
    request: NextRequest,
    context: { params?: Promise<{ id?: string; progressId?: string }> }
) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const paramsResult = await resolveProgressParams(request, context);
    if (paramsResult instanceof NextResponse) return paramsResult;
    const { goalId, progressId } = paramsResult;

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
