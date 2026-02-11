import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const createEntrySchema = z.object({
    year: z.number().min(2020).max(2050),
    month: z.number().min(1).max(12),
    type: z.enum(["SALARY", "SUPPLEMENTARY_INCOME", "EXPENSE"]),
    amount: z.number().min(0),
    note: z.string().optional(),
});

// GET: Liste des entrées financières (avec totaux confirmés pour le graphique)
export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    try {
        const where: Record<string, unknown> = { userId: user.userId };
        if (year) where.year = parseInt(year);
        if (month) where.month = parseInt(month);

        const entries = await prisma.userFinancialEntry.findMany({
            where,
            orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
        });

        // Calcul des totaux confirmés par mois pour le graphique
        const byMonth = new Map<string, { salary: number; supplementary: number; expense: number; entries: typeof entries }>();
        for (const e of entries) {
            const key = `${e.year}-${e.month}`;
            if (!byMonth.has(key)) {
                byMonth.set(key, { salary: 0, supplementary: 0, expense: 0, entries: [] });
            }
            const m = byMonth.get(key)!;
            m.entries.push(e);
            if (e.isConfirmed) {
                if (e.type === "SALARY") m.salary += e.amount;
                else if (e.type === "SUPPLEMENTARY_INCOME") m.supplementary += e.amount;
                else if (e.type === "EXPENSE") m.expense += e.amount;
            }
        }

        const summary = Array.from(byMonth.entries()).map(([key, val]) => {
            const [y, mo] = key.split("-").map(Number);
            const totalIncome = val.salary + val.supplementary;
            const balance = totalIncome - val.expense;
            return {
                year: y,
                month: mo,
                salary: val.salary,
                supplementary: val.supplementary,
                expense: val.expense,
                totalIncome,
                balance,
                entryCount: val.entries.length,
            };
        });

        return NextResponse.json({ entries, summary });
    } catch (error) {
        console.error("Error fetching financial entries:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// POST: Créer une entrée
export async function POST(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const data = createEntrySchema.parse(body);

        const entry = await prisma.userFinancialEntry.create({
            data: {
                userId: user.userId,
                year: data.year,
                month: data.month,
                type: data.type as "SALARY" | "SUPPLEMENTARY_INCOME" | "EXPENSE",
                amount: data.amount,
                note: data.note || null,
            },
        });

        return NextResponse.json({ entry }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Données invalides", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error creating entry:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
