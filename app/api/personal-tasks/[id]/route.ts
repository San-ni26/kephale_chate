import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const updateTaskSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    dueDate: z.string().optional().nullable(),
});

// PATCH: Mettre à jour une tâche
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
        const existing = await prisma.userPersonalTask.findFirst({
            where: { id, userId: user.userId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });
        }

        const body = await request.json();
        const data = updateTaskSchema.parse(body);

        const updateData: Record<string, unknown> = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.priority !== undefined) updateData.priority = data.priority;
        if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;

        if (data.status === "DONE" && existing.status !== "DONE") {
            updateData.completedAt = new Date();
        } else if (data.status !== "DONE" && data.status !== undefined) {
            updateData.completedAt = null;
        }

        const task = await prisma.userPersonalTask.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ task });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error updating personal task:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// DELETE: Supprimer une tâche
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
        const existing = await prisma.userPersonalTask.findFirst({
            where: { id, userId: user.userId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });
        }

        await prisma.userPersonalTask.delete({ where: { id } });
        return NextResponse.json({ message: "Tâche supprimée" });
    } catch (error) {
        console.error("Error deleting personal task:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
