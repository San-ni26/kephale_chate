import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const createTaskSchema = z.object({
    title: z.string().min(1, "Le titre est requis"),
    description: z.string().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    dueDate: z.string().optional(),
});

// GET: Liste des tâches personnelles
export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    try {
        const tasks = await prisma.userPersonalTask.findMany({
            where: {
                userId: user.userId,
                ...(status && status !== "ALL" ? { status: status as "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED" } : {}),
            },
            orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
        });

        return NextResponse.json({ tasks });
    } catch (error) {
        console.error("Error fetching personal tasks:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// POST: Créer une tâche
export async function POST(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { title, description, priority, dueDate } = createTaskSchema.parse(body);

        const task = await prisma.userPersonalTask.create({
            data: {
                userId: user.userId,
                title,
                description: description || null,
                priority: (priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") || "MEDIUM",
                dueDate: dueDate ? new Date(dueDate) : null,
            },
        });

        return NextResponse.json({ task }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error creating personal task:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
