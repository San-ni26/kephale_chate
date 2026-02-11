import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const updateEntrySchema = z.object({
    amount: z.number().min(0).optional(),
    note: z.string().optional().nullable(),
    isConfirmed: z.boolean().optional(),
});

// PATCH: Mettre à jour une entrée (montant, note, confirmation)
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
        const existing = await prisma.userFinancialEntry.findFirst({
            where: { id, userId: user.userId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
        }

        const body = await request.json();
        const data = updateEntrySchema.parse(body);

        const entry = await prisma.userFinancialEntry.update({
            where: { id },
            data: {
                ...(data.amount !== undefined && { amount: data.amount }),
                ...(data.note !== undefined && { note: data.note }),
                ...(data.isConfirmed !== undefined && { isConfirmed: data.isConfirmed }),
            },
        });

        return NextResponse.json({ entry });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error updating entry:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// POST: Confirmer / déconfirmer une entrée (raccourci)
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
        const existing = await prisma.userFinancialEntry.findFirst({
            where: { id, userId: user.userId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
        }

        const entry = await prisma.userFinancialEntry.update({
            where: { id },
            data: { isConfirmed: !existing.isConfirmed },
        });

        return NextResponse.json({ entry });
    } catch (error) {
        console.error("Error toggling confirmation:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// DELETE: Supprimer une entrée
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
        const existing = await prisma.userFinancialEntry.findFirst({
            where: { id, userId: user.userId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
        }

        await prisma.userFinancialEntry.delete({ where: { id } });
        return NextResponse.json({ message: "Entrée supprimée" });
    } catch (error) {
        console.error("Error deleting entry:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
