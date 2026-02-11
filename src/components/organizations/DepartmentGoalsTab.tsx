'use client';

import { useState } from 'react';
import { Target, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/src/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/src/components/ui/select';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface DepartmentGoal {
    id: string;
    title: string;
    description?: string | null;
    targetValue?: number | null;
    currentValue: number;
    period: string;
    periodKey: string;
}

function getPeriodKey(period: string): string {
    const now = new Date();
    if (period === 'MONTHLY') return format(now, 'yyyy-MM');
    if (period === 'QUARTERLY') return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    return String(now.getFullYear());
}

export default function DepartmentGoalsTab({
    orgId,
    deptId,
    canManage,
}: {
    orgId: string;
    deptId: string;
    canManage: boolean;
}) {
    const now = new Date();
    const currentMonth = format(now, 'yyyy-MM');
    const currentQuarter = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    const currentYear = String(now.getFullYear());
    const [period, setPeriod] = useState('MONTHLY');
    const [periodKey, setPeriodKey] = useState(currentMonth);

    const updatePeriodKey = (p: string) => {
        if (p === 'MONTHLY') setPeriodKey(format(new Date(), 'yyyy-MM'));
        else if (p === 'QUARTERLY') setPeriodKey(`${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`);
        else setPeriodKey(String(new Date().getFullYear()));
    };
    const [showCreate, setShowCreate] = useState(false);
    const [editingGoal, setEditingGoal] = useState<DepartmentGoal | null>(null);
    const [form, setForm] = useState({
        title: '',
        description: '',
        targetValue: 100,
        currentValue: 0,
    });
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const goalsUrl = `/api/organizations/${orgId}/departments/${deptId}/goals?period=${period}&periodKey=${periodKey}`;
    const { data: goalsData, mutate } = useSWR<{ goals: DepartmentGoal[] }>(goalsUrl, fetcher);
    const goals = goalsData?.goals ?? [];

    const handleCreate = async () => {
        if (!form.title.trim()) {
            toast.error('Titre requis');
            return;
        }
        setSaving(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/goals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    period,
                    periodKey: periodKey || getPeriodKey(period) || currentMonth,
                }),
            });
            if (res.ok) {
                toast.success('Objectif créé');
                setShowCreate(false);
                setForm({ title: '', description: '', targetValue: 100, currentValue: 0 });
                mutate();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch (e) {
            toast.error('Erreur serveur');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingGoal || !form.title.trim()) return;
        setSaving(true);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/goals/${editingGoal.id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form),
                }
            );
            if (res.ok) {
                toast.success('Objectif mis à jour');
                setEditingGoal(null);
                mutate();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch (e) {
            toast.error('Erreur serveur');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (goal: DepartmentGoal) => {
        if (!confirm(`Supprimer l'objectif « ${goal.title} » ?`)) return;
        setDeletingId(goal.id);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/goals/${goal.id}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                toast.success('Objectif supprimé');
                mutate();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch (e) {
            toast.error('Erreur serveur');
        } finally {
            setDeletingId(null);
        }
    };

    const openEdit = (goal: DepartmentGoal) => {
        setEditingGoal(goal);
        setForm({
            title: goal.title,
            description: goal.description || '',
            targetValue: goal.targetValue ?? 100,
            currentValue: goal.currentValue,
        });
    };

    const progressPercent = (g: DepartmentGoal) => {
        const target = g.targetValue ?? 100;
        return target > 0 ? Math.min(100, Math.round((g.currentValue / target) * 100)) : 0;
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="w-5 h-5" />
                        Objectifs du département
                    </CardTitle>
                    {canManage && (
                        <div className="flex items-center gap-2">
                            <Select value={period} onValueChange={(v) => { setPeriod(v); updatePeriodKey(v); }}>
                                <SelectTrigger className="w-[140px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MONTHLY">Mensuel</SelectItem>
                                    <SelectItem value="QUARTERLY">Trimestriel</SelectItem>
                                    <SelectItem value="YEARLY">Annuel</SelectItem>
                                </SelectContent>
                            </Select>
                            {period === 'MONTHLY' && (
                                <Input
                                    type="month"
                                    value={periodKey}
                                    onChange={(e) => setPeriodKey(e.target.value)}
                                    className="w-[180px]"
                                />
                            )}
                            {period === 'QUARTERLY' && (
                                <Select value={periodKey} onValueChange={setPeriodKey}>
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[1, 2, 3, 4].map((q) => (
                                            <SelectItem key={q} value={`${new Date().getFullYear()}-Q${q}`}>
                                                T{q} {new Date().getFullYear()}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            {period === 'YEARLY' && (
                                <Input
                                    type="number"
                                    value={periodKey}
                                    onChange={(e) => setPeriodKey(e.target.value)}
                                    className="w-[100px]"
                                    placeholder="Année"
                                />
                            )}
                            <Button size="sm" onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                <Plus className="w-4 h-4 mr-2" />
                                Nouvel objectif
                            </Button>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {goals.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                        <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">Aucun objectif pour cette période</p>
                        {canManage && (
                            <Button size="sm" onClick={() => setShowCreate(true)} className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
                                <Plus className="w-4 h-4 mr-2" />
                                Créer un objectif
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {goals.map((goal) => (
                            <Card key={goal.id} className="bg-muted/30 border-border">
                                <CardContent className="pt-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-foreground">{goal.title}</h3>
                                            {goal.description && (
                                                <p className="text-sm text-muted-foreground mt-1">{goal.description}</p>
                                            )}
                                            <div className="mt-3 flex items-center gap-4">
                                                <div className="flex-1 max-w-xs">
                                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary transition-all"
                                                            style={{ width: `${progressPercent(goal)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <span className="text-sm font-medium text-foreground">
                                                    {goal.currentValue} / {goal.targetValue ?? 100} ({progressPercent(goal)}%)
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-2">
                                                {goal.period} — {goal.periodKey}
                                            </p>
                                        </div>
                                        {canManage && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(goal)}>
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => handleDelete(goal)}
                                                    disabled={deletingId === goal.id}
                                                >
                                                    {deletingId === goal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </CardContent>

            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nouvel objectif</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Titre</Label>
                            <Input
                                value={form.title}
                                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                placeholder="Ex: Augmenter les ventes de 20%"
                            />
                        </div>
                        <div>
                            <Label>Description (optionnel)</Label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="Détails..."
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Valeur cible</Label>
                                <Input
                                    type="number"
                                    value={form.targetValue}
                                    onChange={(e) => setForm((f) => ({ ...f, targetValue: Number(e.target.value) || 0 }))}
                                />
                            </div>
                            <div>
                                <Label>Valeur actuelle</Label>
                                <Input
                                    type="number"
                                    value={form.currentValue}
                                    onChange={(e) => setForm((f) => ({ ...f, currentValue: Number(e.target.value) || 0 }))}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
                        <Button onClick={handleCreate} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Créer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editingGoal} onOpenChange={(o) => !o && setEditingGoal(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modifier l&apos;objectif</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Titre</Label>
                            <Input
                                value={form.title}
                                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label>Description (optionnel)</Label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Valeur cible</Label>
                                <Input
                                    type="number"
                                    value={form.targetValue}
                                    onChange={(e) => setForm((f) => ({ ...f, targetValue: Number(e.target.value) || 0 }))}
                                />
                            </div>
                            <div>
                                <Label>Valeur actuelle</Label>
                                <Input
                                    type="number"
                                    value={form.currentValue}
                                    onChange={(e) => setForm((f) => ({ ...f, currentValue: Number(e.target.value) || 0 }))}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingGoal(null)}>Annuler</Button>
                        <Button onClick={handleUpdate} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
