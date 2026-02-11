"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
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

    const [selectedGoal, setSelectedGoal] = useState<FinancialGoal | null>(null);
    const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
    const [entriesYear, setEntriesYear] = useState(currentYear);

    const { data: profileData, mutate: mutateProfile } = useSWR<{ profile: FinancialProfile | null }>(
        "/api/financial-profile",
        fetcher
    );

    const { data: entriesData, mutate: mutateEntries } = useSWR<{
        entries: FinancialEntry[];
        summary: MonthSummary[];
    }>(`/api/financial-entries?year=${entriesYear}`, fetcher);

    const { data: summaryData, mutate: mutateSummary } = useSWR<{ totalPortfolio: number; monthlyBalances: { year: number; month: number; balance: number; cumulative: number }[] }>(
        `/api/financial-entries/summary?year=${entriesYear}`,
        fetcher
    );

    const { data: goalsData, mutate: mutateGoals } = useSWR<{ goals: FinancialGoal[] }>(
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

    const openProgress = (goal: FinancialGoal) => {
        setSelectedGoal(goal);
        const existing = goal.progress.find(
            (p) => p.year === currentYear && p.month === currentMonth
        );
        setProgressForm({
            year: currentYear,
            month: currentMonth,
            amount: existing?.amount?.toString() || "",
            notes: existing?.notes || "",
        });
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
        const amount = parseFloat(progressForm.amount);
        if (isNaN(amount) || amount < 0) {
            toast.error("Montant invalide");
            return;
        }

        try {
            const res = await fetch(`/api/financial-goals/${selectedGoal.id}/progress`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader(),
                },
                body: JSON.stringify({
                    year: progressForm.year,
                    month: progressForm.month,
                    amount,
                    notes: progressForm.notes || undefined,
                }),
            });

            if (res.ok) {
                toast.success("Progrès enregistré");
                mutateGoals();
                setProgressDialogOpen(false);
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur");
            }
        } catch {
            toast.error("Erreur réseau");
        }
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

    const getTotalProgress = (goal: FinancialGoal) =>
        goal.progress.reduce((sum, p) => sum + p.amount, 0);

    const getMonthlyBreakdown = (goal: FinancialGoal, year?: number) => {
        const targetYear = year ?? goal.year ?? currentYear;
        const progressMap = new Map(
            goal.progress.filter((p) => p.year === targetYear).map((p) => [p.month, p.amount])
        );
        return MONTHS_SHORT.map((_, i) => ({
            month: MONTHS_SHORT[i],
            amount: progressMap.get(i + 1) ?? 0,
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
        <div className="p-4 max-w-2xl mx-auto space-y-5 pt-20 min-h-screen bg-background">
            {/* Gestion Financière - style finance minimaliste */}
            <Card className="bg-card border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-5 px-5">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Wallet className="h-3.5 w-3.5" />
                        Gestion Financière
                    </CardTitle>
                    <Button size="sm" variant="ghost" onClick={openProfileDialog} className="text-muted-foreground hover:text-foreground h-8">
                        <Edit className="h-3.5 w-3.5 mr-1" />
                        {profile ? "Modifier" : "Configurer"}
                    </Button>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                    <div className="py-4">
                        <p className="text-xs text-muted-foreground mb-0.5">Portefeuille</p>
                        <p className="text-2xl font-semibold text-primary tracking-tight">
                            {finances?.totalPortfolio.toLocaleString() ?? 0} <span className="text-sm font-normal text-muted-foreground">FCFA</span>
                        </p>
                    </div>
                </CardContent>
            </Card>

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

            {/* Graphique état financier - masqué par défaut */}
            {finances?.showGraph && monthSummaries.length > 0 && (
                <Card className="bg-card border-0 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-5 px-5">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <BarChart3 className="h-3.5 w-3.5" />
                            État financier (confirmé)
                        </CardTitle>
                        <Select value={entriesYear.toString()} onValueChange={(v) => setEntriesYear(parseInt(v))}>
                            <SelectTrigger className="w-20 h-7 text-xs border-0 bg-transparent">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent className="px-5 pb-5">
                        <div className="flex items-end gap-0.5 h-28 pt-4">
                            {MONTHS_SHORT.map((name, i) => {
                                const sm = getSummaryForMonth(entriesYear, i + 1);
                                const maxVal = Math.max(...monthSummaries.map((s) => Math.abs(s.balance)), 1);
                                const height = sm ? (Math.abs(sm.balance) / maxVal) * 80 : 4;
                                const isPositive = sm ? sm.balance >= 0 : false;
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                        <div
                                            className={`w-full rounded-t transition-all min-h-[4px] ${sm
                                                ? isPositive
                                                    ? "bg-success"
                                                    : "bg-destructive"
                                                : "bg-muted"
                                                }`}
                                            style={{ height: `${height}px` }}
                                            title={sm ? `${name}: ${sm.balance >= 0 ? "+" : ""}${sm.balance.toLocaleString()} FCFA` : `${name}: non renseigné`}
                                        />
                                        <p className="text-[9px] text-muted-foreground">{name}</p>
                                    </div>
                                );
                            })}
                        </div>
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
                        <div className="flex gap-2">
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

            {/* Objectifs */}
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
                                                <TrendingUp className="h-4 w-4 mr-2" /> Ajouter une épargne
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
                                                <TrendingUp className="h-4 w-4 mr-2" /> Saisir progrès
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

            {/* Dialog Progrès */}
            <Dialog open={progressDialogOpen} onOpenChange={setProgressDialogOpen}>
                <DialogContent className="bg-card border-border ">
                    <DialogHeader>
                        <DialogTitle>Progrès — {selectedGoal?.targetItem || selectedGoal?.label}</DialogTitle>
                    </DialogHeader>
                    {selectedGoal && (
                        <div className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Année</Label>
                                    <Select
                                        value={progressForm.year.toString()}
                                        onValueChange={(v) => setProgressForm({ ...progressForm, year: parseInt(v) })}
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
                                        value={progressForm.month.toString()}
                                        onValueChange={(v) => setProgressForm({ ...progressForm, month: parseInt(v) })}
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
                                <Label>Montant épargné (FCFA)</Label>
                                <Input
                                    type="number"
                                    placeholder="0"
                                    value={progressForm.amount}
                                    onChange={(e) => setProgressForm({ ...progressForm, amount: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Notes</Label>
                                <Input
                                    placeholder="Ex: Bonus reçu"
                                    value={progressForm.notes}
                                    onChange={(e) => setProgressForm({ ...progressForm, notes: e.target.value })}
                                />
                            </div>
                            <Button onClick={handleSaveProgress} className="w-full">Enregistrer</Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
