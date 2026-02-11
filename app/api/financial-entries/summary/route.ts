import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";

// GET: Synthèse financière - montant réel du portefeuille (somme des soldes confirmés)
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
        // Montant réel du portefeuille = somme de tous les soldes confirmés (toutes années)
        const where: Record<string, unknown> = { userId: user.userId, isConfirmed: true };
        const entries = await prisma.userFinancialEntry.findMany({
            where,
            orderBy: [{ year: "asc" }, { month: "asc" }],
        });

        const byMonth = new Map<string, { income: number; expense: number }>();
        for (const e of entries) {
            const key = `${e.year}-${e.month}`;
            if (!byMonth.has(key)) byMonth.set(key, { income: 0, expense: 0 });
            const m = byMonth.get(key)!;
            if (e.type === "SALARY" || e.type === "SUPPLEMENTARY_INCOME") m.income += e.amount;
            else if (e.type === "EXPENSE") m.expense += e.amount;
        }

        const sortedMonths = Array.from(byMonth.entries()).sort();
        let totalPortfolio = 0;
        let cumulativeInYear = 0;
        const monthlyBalances: { year: number; month: number; balance: number; cumulative: number }[] = [];
        for (const [key, val] of sortedMonths) {
            const [y, mo] = key.split("-").map(Number);
            const balance = val.income - val.expense;
            totalPortfolio += balance;
            if (!year || y === parseInt(year)) {
                cumulativeInYear += balance;
                monthlyBalances.push({
                    year: y,
                    month: mo,
                    balance,
                    cumulative: year ? cumulativeInYear : totalPortfolio,
                });
            }
        }

        return NextResponse.json({
            totalPortfolio,
            monthlyBalances,
        });
    } catch (error) {
        console.error("Error fetching summary:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
