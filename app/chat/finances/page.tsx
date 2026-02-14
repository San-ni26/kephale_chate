"use client";

import { useState, useEffect } from "react";
import { useFinances } from "@/src/contexts/FinancesContext";
import {
    Wallet,
    TrendingUp,
    Target,
    PiggyBank,
    ArrowDownCircle,
    ArrowUpCircle,
    Plus,
    Edit,
    Trash2,
    Banknote,
    Lightbulb,
    Car,
    CheckCircle,
    Circle,
    BarChart3,
    Lock,
    Download,
    Eye,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/src/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/src/components/ui/select";
import { toast } from "sonner";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";
import { getAuthHeader } from "@/src/lib/auth-client";

const MONTHS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const MONTHS_SHORT = [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
    "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

interface FinancialProfile {
    id: string;
    monthlySalary: number;
    supplementaryIncome: number;
    currency: string;
    preferredSavingsRate: number | null;
}

interface FinancialEntry {
    id: string;
    year: number;
    month: number;
    type: "SALARY" | "SUPPLEMENTARY_INCOME" | "EXPENSE";
    amount: number;
    note: string | null;
    isConfirmed: boolean;
}

interface MonthSummary {
    year: number;
    month: number;
    salary: number;
    supplementary: number;
    expense: number;
    totalIncome: number;
    balance: number;
}

interface MonthlyProgress {
    id: string;
    month: number;
    year: number;
    amount: number;
    notes: string | null;
}

interface FinancialGoal {
    id: string;
    type: "ANNUAL_SAVINGS" | "MATERIAL_PURCHASE";
    year: number | null;
    targetItem: string | null;
    targetAmount: number;
    targetDate: string | null;
    label: string | null;
    progress: MonthlyProgress[];
}

export default function FinancesPage() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const [profileDialogOpen, setProfileDialogOpen] = useState(false);
    const [entryDialogOpen, setEntryDialogOpen] = useState(false);
    const [goalDialogOpen, setGoalDialogOpen] = useState(false);
    const [progressDialogOpen, setProgressDialogOpen] = useState(false);
    const [selectedMonthDetail, setSelectedMonthDetail] = useState<{ year: number; month: number } | null>(null);

    const [profileForm, setProfileForm] = useState({
        monthlySalary: "",
        supplementaryIncome: "",
        preferredSavingsRate: "20",
    });

    const [entryForm, setEntryForm] = useState({
        year: currentYear,
        month: currentMonth,
        type: "SALARY" as "SALARY" | "SUPPLEMENTARY_INCOME" | "EXPENSE",
        amount: "",
        note: "",
    });

    const [goalForm, setGoalForm] = useState({
        type: "ANNUAL_SAVINGS" as "ANNUAL_SAVINGS" | "MATERIAL_PURCHASE",
        year: currentYear,
        targetItem: "",
        targetAmount: "",
        targetDate: "",
        label: "",
    });

    const [progressForm, setProgressForm] = useState({
        year: currentYear,
        month: currentMonth,
        amount: "",
        notes: "",
    });

    const [progressFormRows, setProgressFormRows] = useState<{ id: string; year: number; month: number; amount: string; notes: string }[]>([]);

    const [selectedGoal, setSelectedGoal] = useState<FinancialGoal | null>(null);
    const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
    const [entriesYear, setEntriesYear] = useState(currentYear);
    const [progressFilterMonth, setProgressFilterMonth] = useState<number | "all">("all");
    const [progressFilterYear, setProgressFilterYear] = useState<number>(currentYear);
    const [editingProgress, setEditingProgress] = useState<MonthlyProgress | null>(null);
    const [progressEditForm, setProgressEditForm] = useState({ year: currentYear, month: currentMonth, amount: "", notes: "" });

    const { data: profileData, error: profileError, isLoading: profileLoading, mutate: mutateProfile } = useSWR<{ profile: FinancialProfile | null }>(
        "/api/financial-profile",
        fetcher
    );

    const { data: entriesData, error: entriesError, isLoading: entriesLoading, mutate: mutateEntries } = useSWR<{
        entries: FinancialEntry[];
        summary: MonthSummary[];
    }>(`/api/financial-entries?year=${entriesYear}`, fetcher);

    const { data: summaryData, error: summaryError, isLoading: summaryLoading, mutate: mutateSummary } = useSWR<{ totalPortfolio: number; monthlyBalances: { year: number; month: number; balance: number; cumulative: number }[] }>(
        `/api/financial-entries/summary?year=${entriesYear}`,
        fetcher
    );

    const { data: goalsData, error: goalsError, isLoading: goalsLoading, mutate: mutateGoals } = useSWR<{ goals: FinancialGoal[] }>(
        "/api/financial-goals",
        fetcher
    );

    const profile = profileData?.profile;
    const entries = entriesData?.entries || [];
    const monthSummaries = entriesData?.summary || [];
    const totalPortfolio = summaryData?.totalPortfolio ?? 0;
    const goals = goalsData?.goals || [];

    const totalIncome = profile ? profile.monthlySalary + profile.supplementaryIncome : 0;
    const recommendedSavings = profile && profile.preferredSavingsRate
        ? totalIncome * (profile.preferredSavingsRate / 100)
        : totalIncome * 0.2;

    const getSummaryForMonth = (year: number, month: number) =>
        monthSummaries.find((s) => s.year === year && s.month === month);

    const getEntriesForMonth = (year: number, month: number) =>
        entries.filter((e) => e.year === year && e.month === month);

    const openProfileDialog = () => {
        setProfileForm({
            monthlySalary: profile?.monthlySalary?.toString() || "",
            supplementaryIncome: profile?.supplementaryIncome?.toString() || "",
            preferredSavingsRate: profile?.preferredSavingsRate?.toString() || "20",
        });
        setProfileDialogOpen(true);
    };

    const openAddEntry = (year?: number, month?: number) => {
        setEntryForm({
            year: year || currentYear,
            month: month || currentMonth,
            type: "SALARY",
            amount: profile?.monthlySalary?.toString() || "",
            note: "",
        });
        setEntryDialogOpen(true);
    };

    const openMonthDetail = (year: number, month: number) => {
        setSelectedMonthDetail({ year, month });
    };

    const openCreateGoal = (type?: "ANNUAL_SAVINGS" | "MATERIAL_PURCHASE") => {
        setEditingGoal(null);
        setGoalForm({
            type: type || "ANNUAL_SAVINGS",
            year: currentYear,
            targetItem: "",
            targetAmount: "",
            targetDate: "",
            label: "",
        });
        setGoalDialogOpen(true);
    };

    const openEditGoal = (goal: FinancialGoal) => {
        setEditingGoal(goal);
        setGoalForm({
            type: goal.type,
            year: goal.year || currentYear,
            targetItem: goal.targetItem || "",
            targetAmount: goal.targetAmount.toString(),
            targetDate: goal.targetDate ? goal.targetDate.slice(0, 10) : "",
            label: goal.label || "",
        });
        setGoalDialogOpen(true);
    };

    const addProgressRow = () => {
        setProgressFormRows((prev) => [
            ...prev,
            { id: `row-${Date.now()}`, year: currentYear, month: currentMonth, amount: "", notes: "" },
        ]);
    };

    const updateProgressRow = (id: string, field: "id" | "year" | "month" | "amount" | "notes", value: number | string) => {
        setProgressFormRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
        );
    };

    const removeProgressRow = (id: string) => {
        setProgressFormRows((prev) => prev.filter((r) => r.id !== id));
    };

    const openProgress = (goal: FinancialGoal) => {
        setSelectedGoal(goal);
        setProgressFilterYear(currentYear);
        setProgressFilterMonth("all");
        setProgressForm({
            year: currentYear,
            month: currentMonth,
            amount: "",
            notes: "",
        });
        setProgressFormRows([
            { id: `row-${Date.now()}`, year: currentYear, month: currentMonth, amount: "", notes: "" },
        ]);
        setProgressDialogOpen(true);
    };

    const handleSaveProfile = async () => {
        const salary = parseFloat(profileForm.monthlySalary);
        const supp = parseFloat(profileForm.supplementaryIncome);
        const rate = parseFloat(profileForm.preferredSavingsRate);

        if (isNaN(salary) || salary < 0) {
            toast.error("Salaire invalide");
            return;
        }

        try {
            const res = await fetch("/api/financial-profile", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader(),
                },
                body: JSON.stringify({
                    monthlySalary: salary,
                    supplementaryIncome: isNaN(supp) ? 0 : supp,
                    preferredSavingsRate: isNaN(rate) ? 20 : rate,
                }),
            });

            if (res.ok) {
                toast.success("Profil mis à jour");
                mutateProfile();
                setProfileDialogOpen(false);
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur");
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const handleSaveEntry = async () => {
        const amount = parseFloat(entryForm.amount);
        if (isNaN(amount) || amount < 0) {
            toast.error("Montant invalide");
            return;
        }

        try {
            const res = await fetch("/api/financial-entries", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader(),
                },
                body: JSON.stringify({
                    year: entryForm.year,
                    month: entryForm.month,
                    type: entryForm.type,
                    amount,
                    note: entryForm.note || undefined,
                }),
            });

            if (res.ok) {
                toast.success("Entrée enregistrée");
                mutateEntries();
                mutateSummary?.();
                setEntryDialogOpen(false);
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur");
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const handleConfirmEntry = async (id: string) => {
        try {
            const res = await fetch(`/api/financial-entries/${id}`, {
                method: "POST",
                headers: getAuthHeader(),
            });
            if (res.ok) {
                toast.success("Confirmation mise à jour");
                mutateEntries();
                mutateSummary?.();
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const handleDeleteEntry = async (id: string) => {
        if (!confirm("Supprimer cette entrée ?")) return;
        try {
            const res = await fetch(`/api/financial-entries/${id}`, {
                method: "DELETE",
                headers: getAuthHeader(),
            });
            if (res.ok) {
                toast.success("Entrée supprimée");
                mutateEntries();
                mutateSummary?.();
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const handleSaveGoal = async () => {
        const target = parseFloat(goalForm.targetAmount);
        if (isNaN(target) || target < 0) {
            toast.error("Montant invalide");
            return;
        }

        if (goalForm.type === "MATERIAL_PURCHASE" && !goalForm.targetItem.trim()) {
            toast.error("Indiquez le bien à acheter");
            return;
        }

        try {
            if (editingGoal) {
                const res = await fetch(`/api/financial-goals/${editingGoal.id}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        ...getAuthHeader(),
                    },
                    body: JSON.stringify({
                        targetAmount: target,
                        targetItem: goalForm.type === "MATERIAL_PURCHASE" ? goalForm.targetItem : undefined,
                        targetDate: goalForm.targetDate || null,
                        label: goalForm.label || (goalForm.type === "MATERIAL_PURCHASE" ? goalForm.targetItem : `Objectif ${goalForm.year}`),
                    }),
                });

                if (res.ok) {
                    toast.success("Objectif mis à jour");
                    mutateGoals();
                    setGoalDialogOpen(false);
                } else {
                    const err = await res.json();
                    toast.error(err.error || "Erreur");
                }
            } else {
                const res = await fetch("/api/financial-goals", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...getAuthHeader(),
                    },
                    body: JSON.stringify({
                        type: goalForm.type,
                        year: goalForm.type === "ANNUAL_SAVINGS" ? goalForm.year : undefined,
                        targetItem: goalForm.type === "MATERIAL_PURCHASE" ? goalForm.targetItem : undefined,
                        targetAmount: target,
                        targetDate: goalForm.targetDate || undefined,
                        label: goalForm.label || (goalForm.type === "MATERIAL_PURCHASE" ? goalForm.targetItem : `Objectif ${goalForm.year}`),
                    }),
                });

                if (res.ok) {
                    toast.success("Objectif créé");
                    mutateGoals();
                    setGoalDialogOpen(false);
                } else {
                    const err = await res.json();
                    toast.error(err.error || "Erreur");
                }
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const handleSaveProgress = async () => {
        if (!selectedGoal) return;
        const validRows = progressFormRows
            .map((r) => ({ ...r, amountNum: parseFloat(r.amount) }))
            .filter((r) => !isNaN(r.amountNum) && r.amountNum >= 0);
        if (validRows.length === 0) {
            toast.error("Ajoutez au moins une entrée avec un montant valide");
            return;
        }

        try {
            let saved = 0;
            for (const row of validRows) {
                const res = await fetch(`/api/financial-goals/${selectedGoal.id}/progress`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...getAuthHeader(),
                    },
                    body: JSON.stringify({
                        year: row.year,
                        month: row.month,
                        amount: row.amountNum,
                        notes: row.notes || undefined,
                    }),
                });
                if (res.ok) saved++;
                else {
                    const err = await res.json();
                    toast.error(err.error || "Erreur sur une entrée");
                }
            }
            if (saved > 0) {
                toast.success(saved === validRows.length ? "Toutes les entrées enregistrées" : `${saved} entrée(s) enregistrée(s)`);
                mutateGoals();
                setProgressDialogOpen(false);
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const handleDeleteProgress = async (goalId: string, progressId: string) => {
        if (!confirm("Supprimer cette entrée de progrès ?")) return;
        try {
            const res = await fetch(`/api/financial-goals/${goalId}/progress?progressId=${encodeURIComponent(progressId)}`, {
                method: "DELETE",
                headers: getAuthHeader(),
            });
            if (res.ok) {
                toast.success("Entrée supprimée");
                mutateGoals();
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur");
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const openEditProgress = (entry: MonthlyProgress) => {
        setEditingProgress(entry);
        setProgressEditForm({
            year: entry.year,
            month: entry.month,
            amount: entry.amount.toString(),
            notes: entry.notes || "",
        });
    };

    const handleUpdateProgress = async () => {
        if (!selectedGoal || !editingProgress) return;
        const amount = parseFloat(progressEditForm.amount);
        if (isNaN(amount) || amount < 0) {
            toast.error("Montant invalide");
            return;
        }
        try {
            const res = await fetch(`/api/financial-goals/${selectedGoal.id}/progress/${editingProgress.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader(),
                },
                body: JSON.stringify({
                    year: progressEditForm.year,
                    month: progressEditForm.month,
                    amount,
                    notes: progressEditForm.notes || null,
                }),
            });
            if (res.ok) {
                toast.success("Entrée modifiée");
                mutateGoals();
                setEditingProgress(null);
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur");
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const getFilteredProgressList = (goal: FinancialGoal) => {
        let list = [...goal.progress].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
        list = list.filter((p) => p.year === progressFilterYear);
        if (progressFilterMonth !== "all") list = list.filter((p) => p.month === progressFilterMonth);
        return list;
    };

    const handleDeleteGoal = async (id: string) => {
        if (!confirm("Supprimer cet objectif ?")) return;
        try {
            const res = await fetch(`/api/financial-goals/${id}`, {
                method: "DELETE",
                headers: getAuthHeader(),
            });
            if (res.ok) {
                toast.success("Objectif supprimé");
                mutateGoals();
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const handleExportCsv = () => {
        const headers = ["Année", "Mois", "Type", "Montant (FCFA)", "Note", "Confirmé"];
        const rows = entries.map((e) => [
            e.year,
            MONTHS[e.month - 1],
            e.type === "SALARY" ? "Salaire" : e.type === "SUPPLEMENTARY_INCOME" ? "Revenu supplémentaire" : "Dépense",
            e.amount,
            e.note || "",
            e.isConfirmed ? "Oui" : "Non",
        ]);
        const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `finances-entrees-${entriesYear}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Export téléchargé");
    };

    const getTotalProgress = (goal: FinancialGoal) =>
        goal.progress.reduce((sum, p) => sum + p.amount, 0);

    const isGoalReached = (goal: FinancialGoal) =>
        goal.targetAmount > 0 && getTotalProgress(goal) >= goal.targetAmount;

    const getMonthlyBreakdown = (goal: FinancialGoal, year?: number) => {
        const targetYear = year ?? goal.year ?? currentYear;
        const byMonth = new Map<number, number>();
        for (const p of goal.progress.filter((p) => p.year === targetYear)) {
            byMonth.set(p.month, (byMonth.get(p.month) ?? 0) + p.amount);
        }
        return MONTHS_SHORT.map((_, i) => ({
            month: MONTHS_SHORT[i],
            amount: byMonth.get(i + 1) ?? 0,
        }));
    };

    const annualGoals = goals.filter((g) => g.type === "ANNUAL_SAVINGS");
    const purchaseGoals = goals.filter((g) => g.type === "MATERIAL_PURCHASE");

    const finances = useFinances();

    useEffect(() => {
        if (finances) finances.setTotalPortfolio(totalPortfolio);
    }, [finances, totalPortfolio]);

    const [lockDialogOpen, setLockDialogOpen] = useState(false);
    const [codeInput, setCodeInput] = useState("");
    const [pinToSet, setPinToSet] = useState("");

    useEffect(() => {
        const handler = () => {
            if (!finances) return;
            if (finances.isLocked) return;
            if (finances.hasPin) {
                finances.setIsLocked(true);
            } else {
                setLockDialogOpen(true);
            }
        };
        window.addEventListener("finances-toggle-lock", handler);
        return () => window.removeEventListener("finances-toggle-lock", handler);
    }, [finances]);

    const handleUnlock = () => {
        if (finances?.checkCode(codeInput)) {
            toast.success("Page déverrouillée");
            setLockDialogOpen(false);
            setCodeInput("");
        } else {
            toast.error("Code incorrect");
        }
    };

    const handleSetLock = () => {
        if (pinToSet.length < 4) {
            toast.error("Le code doit avoir au moins 4 chiffres");
            return;
        }
        finances?.setPin(pinToSet);
        finances?.setIsLocked(true);
        toast.success("Page verrouillée");
        setLockDialogOpen(false);
        setPinToSet("");
    };

    if (finances && finances.isLocked) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 pt-24">
                <Lock className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-bold mb-2">Page verrouillée</h2>
                <p className="text-sm text-muted-foreground mb-4">Entrez votre code pour accéder</p>
                <Input
                    type="password"
                    placeholder="Code"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    className="max-w-xs mb-2"
                    onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                />
                <Button onClick={handleUnlock}>Déverrouiller</Button>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-5 pt-20 pb-20  bg-background">
            {/* Erreurs API — réessayer */}
            {(profileError || summaryError || goalsError || entriesError) && (
                <Card className="bg-destructive/10 border-destructive/20">
                    <CardContent className="py-3 px-5 flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm text-destructive">Erreur lors du chargement des données.</p>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                mutateProfile();
                                mutateEntries();
                                mutateSummary?.();
                                mutateGoals();
                            }}
                        >
                            Réessayer
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Gestion Financière - style finance minimaliste */}
            <Card className="bg-card border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1  px-5">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Wallet className="h-3.5 w-3.5" />
                        Gestion Financière
                    </CardTitle>
                    <Button size="sm" variant="ghost" onClick={openProfileDialog} className="text-muted-foreground hover:text-foreground h-8" title={profile ? "Modifier le profil financier" : "Configurer le profil financier"}>
                        <Edit className="h-3.5 w-3.5 mr-1" />
                        {profile ? "Modifier" : "Configurer"}
                    </Button>
                </CardHeader>
                <CardContent className="px-5 ">
                    <div className="py-1">
                        <p className="text-xs text-muted-foreground mb-0.5">Portefeuille (solde cumulé)</p>
                        {summaryLoading ? (
                            <div className="h-8 w-48 bg-muted animate-pulse rounded mt-1" />
                        ) : (
                            <p className="text-2xl font-semibold text-primary tracking-tight">
                                {finances?.totalPortfolio.toLocaleString() ?? 0} <span className="text-sm font-normal text-muted-foreground">FCFA</span>
                            </p>
                        )}
                    </div>
                    {/* Actions rapides */}
                    <div className="flex flex-wrap gap-2 mt-4">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => { finances?.setShowEntries(true); openAddEntry(); }}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Ajouter une entrée
                        </Button>

                    </div>
                </CardContent>
            </Card>

            {/* Invitation à configurer le profil si pas encore fait */}
            {!profileLoading && !profile && !profileError && (
                <Card className="bg-muted/30 border border-dashed border-muted-foreground/30">
                    <CardContent className="py-4 px-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                            Configurez votre profil financier (salaire, revenus complémentaires, taux d&apos;épargne) pour recevoir des recommandations personnalisées.
                        </p>
                        <Button size="sm" onClick={openProfileDialog}>Configurer le profil</Button>
                    </CardContent>
                </Card>
            )}

            {/* Recommandations - masqué par défaut, affiché via icône TopNav */}
            {finances?.showRecs && profile && totalIncome > 0 && (
                <Card className="bg-card border-0 shadow-sm">
                    <CardHeader className="pb-1 pt-5 px-5">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Lightbulb className="h-3.5 w-3.5 text-warning" />
                            Recommandations
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 space-y-1">
                        <p className="text-sm text-foreground">
                            Avec un revenu de <strong>{totalIncome.toLocaleString()} FCFA</strong>/mois, épargnez <strong>{Math.round(profile.preferredSavingsRate ?? 20)}%</strong>, soit <strong>{recommendedSavings.toLocaleString()} FCFA</strong>/mois.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Réserve et projets.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Objectifs d'épargne — visible quand on clique sur l'icône Épargne dans la top bar */}
            {finances?.showGraph && (
                <Card className="bg-card border-0 shadow-sm" id="finances-objectifs-epargne">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-5 px-5">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <PiggyBank className="h-3.5 w-3.5" />
                            Objectifs d&apos;épargne
                        </CardTitle>
                        <Button size="sm" onClick={() => openCreateGoal("ANNUAL_SAVINGS")}>
                            <PiggyBank className="h-4 w-4 mr-1" /> Nouvelle épargne
                        </Button>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 space-y-5">

                        {/* Liste des objectifs épargne annuelle */}
                        {goalsLoading ? (
                            <div className="h-24 bg-muted animate-pulse rounded-xl" />
                        ) : annualGoals.length > 0 ? (
                            <div className="space-y-3">
                                <p className="text-xs font-medium text-muted-foreground">Épargne annuelle</p>
                                {annualGoals.map((goal) => {
                                    const total = getTotalProgress(goal);
                                    const pct = goal.targetAmount > 0 ? Math.min(100, (total / goal.targetAmount) * 100) : 0;
                                    const breakdown = getMonthlyBreakdown(goal);
                                    return (
                                        <div key={goal.id} className="rounded-xl border border-border p-4 space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h5 className="font-semibold">{goal.label || `Objectif ${goal.year}`}</h5>
                                                    <p className="text-xs text-muted-foreground">{goal.year}</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditGoal(goal)}>
                                                        <Edit className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteGoal(goal.id)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-sm">
                                                    <span>{total.toLocaleString()} / {goal.targetAmount.toLocaleString()} FCFA</span>
                                                    <span className="font-medium">{pct.toFixed(0)}%</span>
                                                </div>
                                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                            {breakdown.some((b) => b.amount > 0) && (
                                                <div className="grid grid-cols-6 gap-1 pt-2">
                                                    {breakdown.map((m, i) => (
                                                        <div key={i} className="text-center p-1 rounded bg-muted/30">
                                                            <p className="text-[9px] text-muted-foreground">{m.month}</p>
                                                            <p className="text-[10px] font-medium">{m.amount > 0 ? `${(m.amount / 1000).toFixed(0)}k` : "-"}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <Button variant="outline" size="sm" className="w-full" onClick={() => openProgress(goal)}>
                                                {isGoalReached(goal) ? <><Eye className="h-4 w-4 mr-2" /> Voir le détail</> : <><TrendingUp className="h-4 w-4 mr-2" /> Saisir progrès</>}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
                                <PiggyBank className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Aucun objectif d&apos;épargne</p>
                                <Button size="sm" className="mt-2" onClick={() => openCreateGoal("ANNUAL_SAVINGS")}>
                                    Créer un objectif d&apos;épargne
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Entrées détaillées par mois - masqué par défaut */}
            {finances?.showEntries && (
                <Card className="bg-card border-0 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-5 px-5">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <TrendingUp className="h-3.5 w-3.5" />
                            Entrées & Dépenses
                        </CardTitle>
                        <div className="flex gap-2 flex-wrap">
                            <Select value={entriesYear.toString()} onValueChange={(v) => setEntriesYear(parseInt(v))}>
                                <SelectTrigger className="w-24 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button size="sm" onClick={() => openAddEntry()}>
                                <Plus className="h-4 w-4 mr-1" /> Ajouter
                            </Button>
                            {entries.length > 0 && (
                                <Button size="sm" variant="outline" onClick={handleExportCsv} title="Exporter en CSV">
                                    <Download className="h-4 w-4 mr-1" /> Export CSV
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="px-5 pb-5">
                        <div className="grid grid-cols-3 gap-1.5 mb-4">
                            {MONTHS_SHORT.map((name, i) => {
                                const sm = getSummaryForMonth(entriesYear, i + 1);
                                const balance = sm?.balance ?? null;
                                const monthEntries = getEntriesForMonth(entriesYear, i + 1);
                                return (
                                    <button
                                        key={i}
                                        onClick={() => openMonthDetail(entriesYear, i + 1)}
                                        className={`p-2.5 rounded-md border text-left transition-colors ${balance !== null
                                            ? balance >= 0
                                                ? "bg-success/5 border-success/10 hover:bg-success/10"
                                                : "bg-destructive/5 border-destructive/10 hover:bg-destructive/10"
                                            : "bg-muted/20 border-border/50 hover:bg-muted/30"
                                            }`}
                                    >
                                        <p className="text-[10px] text-muted-foreground">{name}</p>
                                        <p className="text-xs font-medium truncate">
                                            {balance !== null
                                                ? `${balance >= 0 ? "+" : ""}${balance.toLocaleString()}`
                                                : monthEntries.length > 0 ? "..." : "-"}
                                        </p>
                                        {monthEntries.length > 0 && (
                                            <p className="text-[9px] text-muted-foreground mt-0.5">
                                                {monthEntries.length} entrée{monthEntries.length > 1 ? "s" : ""}
                                            </p>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Détail du mois sélectionné */}
                        {selectedMonthDetail && (
                            <div className="mt-4 pt-4 border-t border-border">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-semibold">
                                        {MONTHS[selectedMonthDetail.month - 1]} {selectedMonthDetail.year}
                                    </h4>
                                    <Button size="sm" variant="ghost" onClick={() => setSelectedMonthDetail(null)}>Fermer</Button>
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {getEntriesForMonth(selectedMonthDetail.year, selectedMonthDetail.month).length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                            Aucune entrée. Cliquez sur &quot;Ajouter&quot; pour en créer une.
                                        </p>
                                    ) : (
                                        getEntriesForMonth(selectedMonthDetail.year, selectedMonthDetail.month).map((e) => (
                                            <div
                                                key={e.id}
                                                className={`flex items-center justify-between p-3 rounded-lg border ${e.type === "EXPENSE" ? "bg-destructive/5 border-destructive/20" : "bg-success/5 border-success/20"
                                                    }`}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-medium">
                                                            {e.type === "SALARY" ? "Salaire" : e.type === "SUPPLEMENTARY_INCOME" ? "Revenu supp." : "Dépense"}
                                                        </span>
                                                        <span className={`font-semibold ${e.type === "EXPENSE" ? "text-destructive" : "text-success"}`}>
                                                            {e.type === "EXPENSE" ? "-" : "+"}{e.amount.toLocaleString()} FCFA
                                                        </span>
                                                    </div>
                                                    {e.note && (
                                                        <p className="text-xs text-muted-foreground truncate mt-0.5">{e.note}</p>
                                                    )}
                                                </div>
                                                <div className="flex gap-1 shrink-0">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => handleConfirmEntry(e.id)}
                                                        title={e.isConfirmed ? "Déconfirmer" : "Confirmer"}
                                                    >
                                                        {e.isConfirmed ? (
                                                            <CheckCircle className="h-4 w-4 text-success" />
                                                        ) : (
                                                            <Circle className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteEntry(e.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <Button size="sm" className="w-full mt-2" onClick={() => openAddEntry(selectedMonthDetail.year, selectedMonthDetail.month)}>
                                    <Plus className="h-4 w-4 mr-2" /> Ajouter une entrée
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Résumé du mois en cours */}
            {entriesYear === currentYear && (monthSummaries.length > 0 || getEntriesForMonth(currentYear, currentMonth).length > 0) && (
                <Card className="bg-card border-0 shadow-sm">
                    <CardHeader className="pb-1 pt-5 px-5">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Banknote className="h-3.5 w-3.5" />
                            Ce mois — {MONTHS[currentMonth - 1]} {currentYear}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5">
                        {(() => {
                            const sm = getSummaryForMonth(currentYear, currentMonth);
                            const monthEntries = getEntriesForMonth(currentYear, currentMonth);
                            if (!sm && monthEntries.length === 0) return null;
                            const balance = sm?.balance ?? monthEntries.reduce((s, e) => s + (e.type === "EXPENSE" ? -e.amount : e.amount), 0);
                            const salary = sm?.salary ?? 0;
                            const supplementary = sm?.supplementary ?? 0;
                            const expense = sm?.expense ?? 0;
                            return (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                                    <div className="p-2 rounded-lg bg-success/10">
                                        <p className="text-[10px] text-muted-foreground uppercase">Salaire</p>
                                        <p className="text-sm font-semibold text-success">+{salary.toLocaleString()}</p>
                                    </div>
                                    <div className="p-2 rounded-lg bg-blue-500/10">
                                        <p className="text-[10px] text-muted-foreground uppercase">Revenus supp.</p>
                                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">+{supplementary.toLocaleString()}</p>
                                    </div>
                                    <div className="p-2 rounded-lg bg-destructive/10">
                                        <p className="text-[10px] text-muted-foreground uppercase">Dépenses</p>
                                        <p className="text-sm font-semibold text-destructive">-{expense.toLocaleString()}</p>
                                    </div>
                                    <div className="p-2 rounded-lg bg-muted/50">
                                        <p className="text-[10px] text-muted-foreground uppercase">Solde</p>
                                        <p className={`text-sm font-semibold ${balance >= 0 ? "text-success" : "text-destructive"}`}>
                                            {balance >= 0 ? "+" : ""}{balance.toLocaleString()} FCFA
                                        </p>
                                    </div>
                                </div>
                            );
                        })()}
                    </CardContent>
                </Card>
            )}

            {/* Carte Objectifs d'achat — visible quand on clique sur l'icône Achat dans la top bar */}
            {finances?.showPurchases && (
                <Card className="bg-card border-0 shadow-sm" id="finances-objectifs-achat">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-5 px-5">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Car className="h-3.5 w-3.5" />
                            Objectifs d&apos;achat
                        </CardTitle>
                        <Button size="sm" onClick={() => openCreateGoal("MATERIAL_PURCHASE")}>
                            <Car className="h-4 w-4 mr-1" /> Nouvel achat
                        </Button>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 space-y-4">
                        {goalsLoading ? (
                            <div className="space-y-3">
                                <div className="h-24 bg-muted animate-pulse rounded-xl" />
                            </div>
                        ) : purchaseGoals.length > 0 ? (
                            <div className="space-y-3">
                                {purchaseGoals.map((goal) => {
                                    const total = getTotalProgress(goal);
                                    const pct = goal.targetAmount > 0 ? Math.min(100, (total / goal.targetAmount) * 100) : 0;
                                    const breakdown = getMonthlyBreakdown(goal);
                                    const hasBreakdown = breakdown.some((b) => b.amount > 0);
                                    return (
                                        <div key={goal.id} className="rounded-xl border border-border p-4 space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h5 className="font-semibold">{goal.targetItem || goal.label}</h5>
                                                    <p className="text-xs text-muted-foreground">
                                                        {goal.targetAmount.toLocaleString()} FCFA
                                                        {goal.targetDate && ` • ${new Date(goal.targetDate).toLocaleDateString("fr-FR")}`}
                                                    </p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditGoal(goal)}>
                                                        <Edit className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteGoal(goal.id)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-sm">
                                                    <span>{total.toLocaleString()} / {goal.targetAmount.toLocaleString()} FCFA</span>
                                                    <span className="font-medium">{pct.toFixed(0)}%</span>
                                                </div>
                                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                            {hasBreakdown && (
                                                <div className="grid grid-cols-6 gap-1 pt-2">
                                                    {breakdown.map((m, i) => (
                                                        <div key={i} className="text-center p-1 rounded bg-muted/30">
                                                            <p className="text-[9px] text-muted-foreground">{m.month}</p>
                                                            <p className="text-[10px] font-medium">{m.amount > 0 ? `${(m.amount / 1000).toFixed(0)}k` : "-"}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <Button variant="outline" size="sm" className="w-full" onClick={() => openProgress(goal)}>
                                                {isGoalReached(goal) ? <><Eye className="h-4 w-4 mr-2" /> Voir le détail</> : <><TrendingUp className="h-4 w-4 mr-2" /> Ajouter des épargnes</>}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                                <Car className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Aucun objectif d&apos;achat</p>
                                <Button size="sm" className="mt-2" onClick={() => openCreateGoal("MATERIAL_PURCHASE")}>
                                    Créer un objectif d&apos;achat
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Objectifs — séparés en Épargne annuelle et Biens à acheter */}
            <Card className="bg-card border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-5 px-5">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Target className="h-3.5 w-3.5" />
                        Mes objectifs
                    </CardTitle>
                    <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openCreateGoal("ANNUAL_SAVINGS")}>
                            <PiggyBank className="h-4 w-4 mr-1" /> Épargne
                        </Button>
                        <Button size="sm" onClick={() => openCreateGoal("MATERIAL_PURCHASE")}>
                            <Car className="h-4 w-4 mr-1" /> Achat
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-4">
                    {goalsLoading ? (
                        <div className="space-y-3">
                            <div className="h-24 bg-muted animate-pulse rounded-xl" />
                            <div className="h-24 bg-muted animate-pulse rounded-xl" />
                        </div>
                    ) : (
                        <>
                            {/* Objectifs d'achat */}
                            {purchaseGoals.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                                        <Car className="h-4 w-4" /> Biens à acheter
                                    </h4>
                                    <div className="space-y-3">
                                        {purchaseGoals.map((goal) => {
                                            const total = getTotalProgress(goal);
                                            const pct = goal.targetAmount > 0 ? Math.min(100, (total / goal.targetAmount) * 100) : 0;
                                            const breakdown = getMonthlyBreakdown(goal);
                                            const hasBreakdown = breakdown.some((b) => b.amount > 0);
                                            return (
                                                <div key={goal.id} className="rounded-xl border border-border p-4 space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <h5 className="font-semibold">{goal.targetItem || goal.label}</h5>
                                                            <p className="text-xs text-muted-foreground">
                                                                {goal.targetAmount.toLocaleString()} FCFA
                                                                {goal.targetDate && ` • ${new Date(goal.targetDate).toLocaleDateString("fr-FR")}`}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditGoal(goal)}>
                                                                <Edit className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteGoal(goal.id)}>
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-sm">
                                                            <span>{total.toLocaleString()} / {goal.targetAmount.toLocaleString()} FCFA</span>
                                                            <span className="font-medium">{pct.toFixed(0)}%</span>
                                                        </div>
                                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                    {hasBreakdown && (
                                                        <div className="grid grid-cols-6 gap-1 pt-2">
                                                            {breakdown.map((m, i) => (
                                                                <div key={i} className="text-center p-1 rounded bg-muted/30">
                                                                    <p className="text-[9px] text-muted-foreground">{m.month}</p>
                                                                    <p className="text-[10px] font-medium">{m.amount > 0 ? `${(m.amount / 1000).toFixed(0)}k` : "-"}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <Button variant="outline" size="sm" className="w-full" onClick={() => openProgress(goal)}>
                                                        {isGoalReached(goal) ? <><Eye className="h-4 w-4 mr-2" /> Voir le détail</> : <><TrendingUp className="h-4 w-4 mr-2" /> Ajouter une épargne</>}
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Objectifs d'épargne annuelle */}
                            {annualGoals.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                                        <PiggyBank className="h-4 w-4" /> Épargne annuelle
                                    </h4>
                                    <div className="space-y-3">
                                        {annualGoals.map((goal) => {
                                            const total = getTotalProgress(goal);
                                            const pct = goal.targetAmount > 0 ? Math.min(100, (total / goal.targetAmount) * 100) : 0;
                                            const breakdown = getMonthlyBreakdown(goal);
                                            return (
                                                <div key={goal.id} className="rounded-xl border border-border p-4 space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <h5 className="font-semibold">{goal.label || `Objectif ${goal.year}`}</h5>
                                                            <p className="text-xs text-muted-foreground">{goal.year}</p>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditGoal(goal)}>
                                                                <Edit className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteGoal(goal.id)}>
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-sm">
                                                            <span>{total.toLocaleString()} / {goal.targetAmount.toLocaleString()} FCFA</span>
                                                            <span className="font-medium">{pct.toFixed(0)}%</span>
                                                        </div>
                                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                    {breakdown.length > 0 && (
                                                        <div className="grid grid-cols-6 gap-1 pt-2">
                                                            {breakdown.map((m, i) => (
                                                                <div key={i} className="text-center p-1 rounded bg-muted/30">
                                                                    <p className="text-[9px] text-muted-foreground">{m.month}</p>
                                                                    <p className="text-[10px] font-medium">{m.amount > 0 ? `${(m.amount / 1000).toFixed(0)}k` : "-"}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <Button variant="outline" size="sm" className="w-full" onClick={() => openProgress(goal)}>
                                                        {isGoalReached(goal) ? <><Eye className="h-4 w-4 mr-2" /> Voir le détail</> : <><TrendingUp className="h-4 w-4 mr-2" /> Saisir progrès</>}
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {goals.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                                    <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">Aucun objectif défini</p>
                                    <div className="flex gap-2 justify-center mt-2">
                                        <Button variant="outline" size="sm" onClick={() => openCreateGoal("ANNUAL_SAVINGS")}>
                                            Épargne annuelle
                                        </Button>
                                        <Button size="sm" onClick={() => openCreateGoal("MATERIAL_PURCHASE")}>
                                            Achat d&apos;un bien
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Dialog Profil */}
            <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>Profil financier</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div>
                            <Label>Salaire mensuel (FCFA) *</Label>
                            <Input
                                type="number"
                                placeholder="Ex: 250000"
                                value={profileForm.monthlySalary}
                                onChange={(e) => setProfileForm({ ...profileForm, monthlySalary: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Revenus supplémentaires / mois (FCFA)</Label>
                            <Input
                                type="number"
                                placeholder="Freelance, bonus..."
                                value={profileForm.supplementaryIncome}
                                onChange={(e) => setProfileForm({ ...profileForm, supplementaryIncome: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Taux d&apos;épargne recommandé (%)</Label>
                            <Input
                                type="number"
                                placeholder="20"
                                min={5}
                                max={80}
                                value={profileForm.preferredSavingsRate}
                                onChange={(e) => setProfileForm({ ...profileForm, preferredSavingsRate: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground mt-1">Entre 5% et 80%</p>
                        </div>
                        <Button onClick={handleSaveProfile} className="w-full">Enregistrer</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog Définir le code de verrouillage */}
            <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>Définir un code d&apos;accès</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <p className="text-sm text-muted-foreground">
                            Choisissez un code d&apos;au moins 4 chiffres pour verrouiller l&apos;accès à la page Finances.
                        </p>
                        <Input
                            type="password"
                            inputMode="numeric"
                            placeholder="Code (4+ chiffres)"
                            value={pinToSet}
                            onChange={(e) => setPinToSet(e.target.value.replace(/\D/g, ""))}
                            maxLength={8}
                        />
                        <Button onClick={handleSetLock} disabled={pinToSet.length < 4} className="w-full">
                            Verrouiller la page
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog Ajouter entrée */}
            <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>Ajouter une entrée — {MONTHS[entryForm.month - 1]} {entryForm.year}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Année</Label>
                                <Select
                                    value={entryForm.year.toString()}
                                    onValueChange={(v) => setEntryForm({ ...entryForm, year: parseInt(v) })}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                                            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Mois</Label>
                                <Select
                                    value={entryForm.month.toString()}
                                    onValueChange={(v) => setEntryForm({ ...entryForm, month: parseInt(v) })}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {MONTHS.map((_, i) => (
                                            <SelectItem key={i} value={(i + 1).toString()}>{MONTHS[i]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <Label>Type</Label>
                            <Select
                                value={entryForm.type}
                                onValueChange={(v) => setEntryForm({ ...entryForm, type: v as "SALARY" | "SUPPLEMENTARY_INCOME" | "EXPENSE" })}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="SALARY">
                                        <span className="flex items-center gap-2">
                                            <ArrowDownCircle className="h-4 w-4 text-success" /> Salaire
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="SUPPLEMENTARY_INCOME">
                                        <span className="flex items-center gap-2">
                                            <ArrowDownCircle className="h-4 w-4 text-blue-500" /> Revenu supplémentaire
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="EXPENSE">
                                        <span className="flex items-center gap-2">
                                            <ArrowUpCircle className="h-4 w-4 text-destructive" /> Dépense
                                        </span>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Montant (FCFA) *</Label>
                            <Input
                                type="number"
                                placeholder="0"
                                value={entryForm.amount}
                                onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Note (optionnel)</Label>
                            <Input
                                placeholder={entryForm.type === "SALARY" ? "Ex: Salaire janvier" : entryForm.type === "EXPENSE" ? "Ex: Loyer, courses..." : "Ex: Freelance, bonus"}
                                value={entryForm.note}
                                onChange={(e) => setEntryForm({ ...entryForm, note: e.target.value })}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Confirmez chaque entrée après vérification pour qu&apos;elle soit prise en compte dans le graphique et le portefeuille.
                        </p>
                        <Button onClick={handleSaveEntry} className="w-full">Enregistrer</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog Objectif */}
            <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>
                            {editingGoal ? "Modifier l'objectif" : goalForm.type === "MATERIAL_PURCHASE" ? "Achat d'un bien" : "Épargne annuelle"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        {!editingGoal && (
                            <div>
                                <Label>Type</Label>
                                <Select
                                    value={goalForm.type}
                                    onValueChange={(v) => setGoalForm({ ...goalForm, type: v as "ANNUAL_SAVINGS" | "MATERIAL_PURCHASE" })}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ANNUAL_SAVINGS">Épargne annuelle</SelectItem>
                                        <SelectItem value="MATERIAL_PURCHASE">Achat d&apos;un bien matériel</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {goalForm.type === "MATERIAL_PURCHASE" && (
                            <div>
                                <Label>Bien à acheter *</Label>
                                <Input
                                    placeholder="Ex: Voiture, Téléphone, Ordinateur..."
                                    value={goalForm.targetItem}
                                    onChange={(e) => setGoalForm({ ...goalForm, targetItem: e.target.value })}
                                />
                            </div>
                        )}

                        {goalForm.type === "ANNUAL_SAVINGS" && !editingGoal && (
                            <div>
                                <Label>Année</Label>
                                <Input
                                    type="number"
                                    value={goalForm.year}
                                    onChange={(e) => setGoalForm({ ...goalForm, year: parseInt(e.target.value) || currentYear })}
                                    min={2020}
                                    max={2050}
                                />
                            </div>
                        )}

                        <div>
                            <Label>Montant cible (FCFA) *</Label>
                            <Input
                                type="number"
                                placeholder="Ex: 5000000"
                                value={goalForm.targetAmount}
                                onChange={(e) => setGoalForm({ ...goalForm, targetAmount: e.target.value })}
                            />
                        </div>

                        {goalForm.type === "MATERIAL_PURCHASE" && (
                            <div>
                                <Label>Date souhaitée (optionnel)</Label>
                                <Input
                                    type="date"
                                    value={goalForm.targetDate}
                                    onChange={(e) => setGoalForm({ ...goalForm, targetDate: e.target.value })}
                                />
                            </div>
                        )}

                        <div>
                            <Label>Label (optionnel)</Label>
                            <Input
                                placeholder={goalForm.type === "MATERIAL_PURCHASE" ? "Ex: Toyota Yaris" : "Ex: Épargne 2025"}
                                value={goalForm.label}
                                onChange={(e) => setGoalForm({ ...goalForm, label: e.target.value })}
                            />
                        </div>

                        <Button onClick={handleSaveGoal} className="w-full">
                            {editingGoal ? "Mettre à jour" : "Créer"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog Progrès — plusieurs entrées */}
            <Dialog open={progressDialogOpen} onOpenChange={(open) => { if (!open) setEditingProgress(null); setProgressDialogOpen(open); }}>
                <DialogContent className="bg-card border-border max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Progrès — {selectedGoal?.targetItem || selectedGoal?.label}</DialogTitle>
                    </DialogHeader>
                    {selectedGoal && (
                        <div className="space-y-4 pt-4 overflow-y-auto flex-1 min-h-0">
                            {/* Liste des entrées enregistrées + filtre */}
                            {selectedGoal.progress.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <p className="text-xs font-medium text-muted-foreground">Entrées enregistrées</p>
                                        <div className="flex gap-1">
                                            <Select value={progressFilterYear.toString()} onValueChange={(v) => setProgressFilterYear(parseInt(v))}>
                                                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                                                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Select value={progressFilterMonth === "all" ? "all" : progressFilterMonth.toString()} onValueChange={(v) => setProgressFilterMonth(v === "all" ? "all" : parseInt(v))}>
                                                <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Tous les mois</SelectItem>
                                                    {MONTHS.map((_, i) => (
                                                        <SelectItem key={i} value={(i + 1).toString()}>{MONTHS_SHORT[i]}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-lg border border-border p-2 bg-muted/10">
                                        {getFilteredProgressList(selectedGoal).map((p) => (
                                            <div key={p.id} className="flex items-center justify-between gap-2 py-2 px-2 rounded bg-background border border-border">
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-xs font-medium">{MONTHS[p.month - 1]} {p.year}</span>
                                                    <span className="ml-2 text-xs text-primary font-semibold">{p.amount.toLocaleString()} FCFA</span>
                                                    {p.notes && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{p.notes}</p>}
                                                </div>
                                                {!isGoalReached(selectedGoal) && (
                                                    <div className="flex gap-0.5 shrink-0">
                                                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditProgress(p)} title="Modifier">
                                                            <Edit className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteProgress(selectedGoal.id, p.id)} title="Supprimer">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {isGoalReached(selectedGoal) ? (
                                <p className="text-xs text-muted-foreground font-medium">Objectif atteint — consultation des entrées uniquement.</p>
                            ) : (
                                <>
                            <p className="text-xs text-muted-foreground">Ajoutez une ou plusieurs entrées d&apos;épargne (mois, montant).</p>
                            <div className="space-y-3">
                                {progressFormRows.map((row) => (
                                    <div key={row.id} className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                                        <div className="flex justify-between items-center gap-2">
                                            <span className="text-xs font-medium text-muted-foreground">Entrée</span>
                                            {progressFormRows.length > 1 && (
                                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeProgressRow(row.id)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-xs">Année</Label>
                                                <Select
                                                    value={row.year.toString()}
                                                    onValueChange={(v) => updateProgressRow(row.id, "year", parseInt(v))}
                                                >
                                                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {[currentYear, currentYear - 1, currentYear + 1].map((y) => (
                                                            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div>
                                                <Label className="text-xs">Mois</Label>
                                                <Select
                                                    value={row.month.toString()}
                                                    onValueChange={(v) => updateProgressRow(row.id, "month", parseInt(v))}
                                                >
                                                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {MONTHS.map((_, i) => (
                                                            <SelectItem key={i} value={(i + 1).toString()}>{MONTHS[i]}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Montant (FCFA)</Label>
                                            <Input
                                                type="number"
                                                placeholder="0"
                                                className="h-8"
                                                value={row.amount}
                                                onChange={(e) => updateProgressRow(row.id, "amount", e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Notes</Label>
                                            <Input
                                                placeholder="Ex: Bonus reçu"
                                                className="h-8"
                                                value={row.notes}
                                                onChange={(e) => updateProgressRow(row.id, "notes", e.target.value)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button type="button" variant="outline" size="sm" className="w-full" onClick={addProgressRow}>
                                <Plus className="h-4 w-4 mr-2" /> Ajouter une entrée
                            </Button>
                            <Button onClick={handleSaveProgress} className="w-full">Enregistrer tout</Button>
                            </>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Dialog Modifier une entrée de progrès */}
            <Dialog open={!!editingProgress} onOpenChange={(open) => { if (!open) setEditingProgress(null); }}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>Modifier l&apos;entrée</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Année</Label>
                                <Select
                                    value={progressEditForm.year.toString()}
                                    onValueChange={(v) => setProgressEditForm({ ...progressEditForm, year: parseInt(v) })}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {[currentYear, currentYear - 1, currentYear + 1].map((y) => (
                                            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Mois</Label>
                                <Select
                                    value={progressEditForm.month.toString()}
                                    onValueChange={(v) => setProgressEditForm({ ...progressEditForm, month: parseInt(v) })}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {MONTHS.map((_, i) => (
                                            <SelectItem key={i} value={(i + 1).toString()}>{MONTHS[i]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <Label>Montant (FCFA)</Label>
                            <Input
                                type="number"
                                placeholder="0"
                                value={progressEditForm.amount}
                                onChange={(e) => setProgressEditForm({ ...progressEditForm, amount: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Notes</Label>
                            <Input
                                placeholder="Ex: Bonus reçu"
                                value={progressEditForm.notes}
                                onChange={(e) => setProgressEditForm({ ...progressEditForm, notes: e.target.value })}
                            />
                        </div>
                        <Button onClick={handleUpdateProgress} className="w-full">Enregistrer</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
