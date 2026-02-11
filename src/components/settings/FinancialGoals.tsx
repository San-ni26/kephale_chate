"use client";

import { useState, useEffect } from "react";
import { Target, Plus, Trash2, Edit, TrendingUp, ChevronRight, Banknote } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/src/components/ui/dialog";
import { toast } from "sonner";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";
import { getAuthHeader } from "@/src/lib/auth-client";

const MONTHS = [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
    "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

interface MonthlyProgress {
    id: string;
    month: number;
    year: number;
    amount: number;
    notes: string | null;
}

interface FinancialGoal {
    id: string;
    year: number;
    targetAmount: number;
    label: string | null;
    progress: MonthlyProgress[];
}

export function FinancialGoals() {
    const [goalDialogOpen, setGoalDialogOpen] = useState(false);
    const [progressDialogOpen, setProgressDialogOpen] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState<FinancialGoal | null>(null);
    const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
    const [goalForm, setGoalForm] = useState({
        year: new Date().getFullYear(),
        targetAmount: "",
        label: "",
    });
    const [progressForm, setProgressForm] = useState({
        month: new Date().getMonth() + 1,
        amount: "",
        notes: "",
    });

    const { data, mutate, isLoading } = useSWR<{ goals: FinancialGoal[] }>(
        "/api/financial-goals",
        fetcher
    );

    const goals = data?.goals || [];

    const openCreateGoal = () => {
        setEditingGoal(null);
        setGoalForm({
            year: new Date().getFullYear(),
            targetAmount: "",
            label: "",
        });
        setGoalDialogOpen(true);
    };

    const openEditGoal = (goal: FinancialGoal) => {
        setEditingGoal(goal);
        setGoalForm({
            year: goal.year,
            targetAmount: goal.targetAmount.toString(),
            label: goal.label || "",
        });
        setGoalDialogOpen(true);
    };

    const openProgress = (goal: FinancialGoal) => {
        setSelectedGoal(goal);
        const currentMonth = new Date().getMonth() + 1;
        const existing = goal.progress.find((p) => p.month === currentMonth);
        setProgressForm({
            month: currentMonth,
            amount: existing?.amount?.toString() || "",
            notes: existing?.notes || "",
        });
        setProgressDialogOpen(true);
    };

    useEffect(() => {
        if (selectedGoal && progressDialogOpen) {
            const existing = selectedGoal.progress.find((p) => p.month === progressForm.month);
            setProgressForm((prev) => ({
                ...prev,
                amount: existing?.amount?.toString() || "",
                notes: existing?.notes || "",
            }));
        }
    }, [selectedGoal, progressForm.month, progressDialogOpen]);

    const handleCreateOrUpdateGoal = async () => {
        const target = parseFloat(goalForm.targetAmount);
        if (isNaN(target) || target < 0) {
            toast.error("Montant invalide");
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
                        label: goalForm.label || `Objectif ${goalForm.year}`,
                    }),
                });
                if (res.ok) {
                    toast.success("Objectif mis à jour");
                    mutate();
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
                        year: goalForm.year,
                        targetAmount: target,
                        label: goalForm.label || `Objectif ${goalForm.year}`,
                    }),
                });
                if (res.ok) {
                    toast.success("Objectif créé");
                    mutate();
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
                    month: progressForm.month,
                    amount,
                    notes: progressForm.notes || undefined,
                }),
            });
            if (res.ok) {
                toast.success("Progrès enregistré");
                mutate();
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
        if (!confirm("Supprimer cet objectif et tout son suivi ?")) return;
        try {
            const res = await fetch(`/api/financial-goals/${id}`, {
                method: "DELETE",
                headers: getAuthHeader(),
            });
            if (res.ok) {
                toast.success("Objectif supprimé");
                mutate();
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const getTotalProgress = (goal: FinancialGoal) => {
        return goal.progress.reduce((sum, p) => sum + p.amount, 0);
    };

    const getMonthlyBreakdown = (goal: FinancialGoal) => {
        const total = getTotalProgress(goal);
        const progressMap = new Map(goal.progress.map((p) => [p.month, p.amount]));
        return MONTHS.map((name, i) => ({
            month: name,
            amount: progressMap.get(i + 1) ?? 0,
        }));
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm uppercase text-muted-foreground font-bold flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Objectifs financiers
                </CardTitle>
                <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" onClick={openCreateGoal}>
                            <Plus className="h-4 w-4 mr-1" /> Nouveau
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border">
                        <DialogHeader>
                            <DialogTitle>{editingGoal ? "Modifier l'objectif" : "Nouvel objectif annuel"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div>
                                <Label>Année</Label>
                                <Input
                                    type="number"
                                    value={goalForm.year}
                                    onChange={(e) => setGoalForm({ ...goalForm, year: parseInt(e.target.value) || new Date().getFullYear() })}
                                    min={2020}
                                    max={2050}
                                    disabled={!!editingGoal}
                                />
                                {editingGoal && (
                                    <p className="text-xs text-muted-foreground mt-1">L'année ne peut pas être modifiée</p>
                                )}
                            </div>
                            <div>
                                <Label>Montant cible (FCFA) *</Label>
                                <Input
                                    type="number"
                                    placeholder="Ex: 5000000"
                                    value={goalForm.targetAmount}
                                    onChange={(e) => setGoalForm({ ...goalForm, targetAmount: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Label (optionnel)</Label>
                                <Input
                                    placeholder="Ex: Épargne annuelle"
                                    value={goalForm.label}
                                    onChange={(e) => setGoalForm({ ...goalForm, label: e.target.value })}
                                />
                            </div>
                            <Button onClick={handleCreateOrUpdateGoal} className="w-full">
                                {editingGoal ? "Mettre à jour" : "Créer"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="text-sm text-muted-foreground py-6 text-center">Chargement...</div>
                ) : goals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                        <Banknote className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Aucun objectif financier</p>
                        <p className="text-xs mt-1">Définissez un objectif annuel et suivez vos progrès par mois</p>
                        <Button variant="outline" size="sm" className="mt-2" onClick={openCreateGoal}>
                            Créer un objectif
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {goals.map((goal) => {
                            const total = getTotalProgress(goal);
                            const pct = goal.targetAmount > 0 ? Math.min(100, (total / goal.targetAmount) * 100) : 0;
                            const breakdown = getMonthlyBreakdown(goal);

                            return (
                                <div
                                    key={goal.id}
                                    className="rounded-xl border border-border bg-muted/20 p-4 space-y-3"
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className="font-semibold text-foreground">
                                                {goal.label || `Objectif ${goal.year}`}
                                            </h4>
                                            <p className="text-xs text-muted-foreground">{goal.year}</p>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => openEditGoal(goal)}
                                            >
                                                <Edit className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                                onClick={() => handleDeleteGoal(goal.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">
                                                {total.toLocaleString()} / {goal.targetAmount.toLocaleString()} FCFA
                                            </span>
                                            <span className="font-medium">{pct.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary rounded-full transition-all duration-300"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-6 gap-1 pt-2 border-t border-border">
                                        {breakdown.map((m, i) => (
                                            <div
                                                key={i}
                                                className="text-center p-2 rounded-md bg-muted/30"
                                                title={`${m.month}: ${m.amount.toLocaleString()} FCFA`}
                                            >
                                                <p className="text-[10px] text-muted-foreground">{m.month}</p>
                                                <p className="text-xs font-medium truncate">
                                                    {m.amount > 0 ? `${(m.amount / 1000).toFixed(0)}k` : "-"}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => openProgress(goal)}
                                    >
                                        <TrendingUp className="h-4 w-4 mr-2" />
                                        Saisir le progrès mensuel
                                        <ChevronRight className="h-4 w-4 ml-auto" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>

            {/* Dialog pour saisir le progrès mensuel */}
            <Dialog open={progressDialogOpen} onOpenChange={setProgressDialogOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>
                            Progrès mensuel — {selectedGoal?.label || `Objectif ${selectedGoal?.year}`}
                        </DialogTitle>
                    </DialogHeader>
                    {selectedGoal && (
                        <div className="space-y-4 pt-4">
                            <div>
                                <Label>Mois</Label>
                                <select
                                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                    value={progressForm.month}
                                    onChange={(e) => setProgressForm({ ...progressForm, month: parseInt(e.target.value) })}
                                >
                                    {MONTHS.map((name, i) => (
                                        <option key={i} value={i + 1}>
                                            {name} {selectedGoal.year}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label>Montant atteint (FCFA)</Label>
                                <Input
                                    type="number"
                                    placeholder="0"
                                    value={progressForm.amount}
                                    onChange={(e) => setProgressForm({ ...progressForm, amount: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Notes (optionnel)</Label>
                                <Input
                                    placeholder="Ex: Bonus de fin d'année"
                                    value={progressForm.notes}
                                    onChange={(e) => setProgressForm({ ...progressForm, notes: e.target.value })}
                                />
                            </div>
                            <Button onClick={handleSaveProgress} className="w-full">
                                Enregistrer
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
