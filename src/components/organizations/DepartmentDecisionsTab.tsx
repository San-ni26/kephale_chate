'use client';

import { useState } from 'react';
import { Vote, Plus, Pencil, Trash2, Loader2, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
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
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface TeamDecision {
    id: string;
    title: string;
    description?: string | null;
    voteDeadline?: string | null;
    status: string;
    votes: { userId: string; vote: string }[];
    creator: { id: string; name: string | null; email: string };
}

export default function DepartmentDecisionsTab({
    orgId,
    deptId,
    canManage,
}: {
    orgId: string;
    deptId: string;
    canManage: boolean;
}) {
    const currentUser = getUser();
    const [showCreate, setShowCreate] = useState(false);
    const [editingDecision, setEditingDecision] = useState<TeamDecision | null>(null);
    const [form, setForm] = useState({
        title: '',
        description: '',
        voteDeadline: '',
    });
    const [statusForm, setStatusForm] = useState('');
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [votingDecisionId, setVotingDecisionId] = useState<string | null>(null);

    const { data: decisionsData, mutate } = useSWR<{ decisions: TeamDecision[] }>(
        `/api/organizations/${orgId}/departments/${deptId}/decisions`,
        fetcher
    );
    const decisions = decisionsData?.decisions ?? [];

    const handleCreate = async () => {
        if (!form.title.trim()) {
            toast.error('Titre requis');
            return;
        }
        setSaving(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    voteDeadline: form.voteDeadline || null,
                }),
            });
            if (res.ok) {
                toast.success('Décision proposée');
                setShowCreate(false);
                setForm({ title: '', description: '', voteDeadline: '' });
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
        if (!editingDecision) return;
        setSaving(true);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/decisions/${editingDecision.id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: form.title,
                        description: form.description || null,
                        voteDeadline: form.voteDeadline || null,
                        ...(statusForm ? { status: statusForm } : {}),
                    }),
                }
            );
            if (res.ok) {
                toast.success('Décision mise à jour');
                setEditingDecision(null);
                setStatusForm('');
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

    const handleVote = async (decisionId: string, vote: 'FOR' | 'AGAINST' | 'ABSTAIN') => {
        setVotingDecisionId(decisionId);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/decisions/${decisionId}/vote`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vote }),
                }
            );
            if (res.ok) {
                toast.success('Vote enregistré');
                mutate();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch (e) {
            toast.error('Erreur serveur');
        } finally {
            setVotingDecisionId(null);
        }
    };

    const handleDelete = async (decision: TeamDecision) => {
        if (!confirm(`Supprimer la décision « ${decision.title} » ?`)) return;
        setDeletingId(decision.id);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/decisions/${decision.id}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                toast.success('Décision supprimée');
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

    const openEdit = (decision: TeamDecision) => {
        setEditingDecision(decision);
        setForm({
            title: decision.title,
            description: decision.description || '',
            voteDeadline: decision.voteDeadline ? format(new Date(decision.voteDeadline), "yyyy-MM-dd'T'HH:mm") : '',
        });
        setStatusForm(decision.status);
    };

    const getVoteCounts = (d: TeamDecision) => {
        const forCount = d.votes.filter((v) => v.vote === 'FOR').length;
        const againstCount = d.votes.filter((v) => v.vote === 'AGAINST').length;
        const abstainCount = d.votes.filter((v) => v.vote === 'ABSTAIN').length;
        return { forCount, againstCount, abstainCount };
    };

    const getUserVote = (d: TeamDecision) =>
        d.votes.find((v) => v.userId === currentUser?.id)?.vote;

    const isVoteOver = (d: TeamDecision) =>
        d.status !== 'PENDING' || (d.voteDeadline && new Date(d.voteDeadline) < new Date());

    const getStatusLabel = (d: TeamDecision) => {
        if (d.status === 'APPROVED') return { label: 'Approuvée', color: 'text-green-600 bg-green-100 dark:bg-green-900/30' };
        if (d.status === 'REJECTED') return { label: 'Rejetée', color: 'text-red-600 bg-red-100 dark:bg-red-900/30' };
        return { label: 'En attente', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30' };
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Vote className="w-5 h-5" />
                        Décisions d&apos;équipe
                    </CardTitle>
                    {canManage && (
                        <Button size="sm" onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            <Plus className="w-4 h-4 mr-2" />
                            Proposer une décision
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {decisions.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                        <Vote className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">Aucune décision en cours</p>
                        {canManage && (
                            <Button size="sm" onClick={() => setShowCreate(true)} className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
                                <Plus className="w-4 h-4 mr-2" />
                                Proposer une décision
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {decisions.map((decision) => {
                            const over = isVoteOver(decision);
                            const myVote = getUserVote(decision);
                            const { forCount, againstCount, abstainCount } = getVoteCounts(decision);
                            const statusInfo = getStatusLabel(decision);

                            return (
                                <Card key={decision.id} className="bg-muted/30 border-border">
                                    <CardContent className="pt-6">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-foreground">{decision.title}</h3>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                                                        {statusInfo.label}
                                                    </span>
                                                </div>
                                                {decision.description && (
                                                    <p className="text-sm text-muted-foreground mt-1">{decision.description}</p>
                                                )}
                                                {decision.voteDeadline && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        Vote jusqu&apos;au : {format(new Date(decision.voteDeadline), 'd MMM yyyy à HH:mm', { locale: fr })}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-4 mt-3 text-sm">
                                                    <span className="flex items-center gap-1 text-green-600">
                                                        <ThumbsUp className="w-4 h-4" />
                                                        {forCount} pour
                                                    </span>
                                                    <span className="flex items-center gap-1 text-red-600">
                                                        <ThumbsDown className="w-4 h-4" />
                                                        {againstCount} contre
                                                    </span>
                                                    <span className="flex items-center gap-1 text-muted-foreground">
                                                        <Minus className="w-4 h-4" />
                                                        {abstainCount} abstention
                                                    </span>
                                                </div>
                                                {!over && (
                                                    <div className="flex items-center gap-2 mt-3">
                                                        <Button
                                                            variant={myVote === 'FOR' ? 'default' : 'outline'}
                                                            size="sm"
                                                            onClick={() => handleVote(decision.id, 'FOR')}
                                                            disabled={votingDecisionId === decision.id}
                                                        >
                                                            {votingDecisionId === decision.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                                            <ThumbsUp className="w-3 h-3 mr-1" />
                                                            Pour
                                                        </Button>
                                                        <Button
                                                            variant={myVote === 'AGAINST' ? 'destructive' : 'outline'}
                                                            size="sm"
                                                            onClick={() => handleVote(decision.id, 'AGAINST')}
                                                            disabled={votingDecisionId === decision.id}
                                                        >
                                                            <ThumbsDown className="w-3 h-3 mr-1" />
                                                            Contre
                                                        </Button>
                                                        <Button
                                                            variant={myVote === 'ABSTAIN' ? 'secondary' : 'outline'}
                                                            size="sm"
                                                            onClick={() => handleVote(decision.id, 'ABSTAIN')}
                                                            disabled={votingDecisionId === decision.id}
                                                        >
                                                            <Minus className="w-3 h-3 mr-1" />
                                                            Abstention
                                                        </Button>
                                                    </div>
                                                )}
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    Par {decision.creator.name || decision.creator.email}
                                                </p>
                                            </div>
                                            {canManage && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(decision)}>
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                                        onClick={() => handleDelete(decision)}
                                                        disabled={deletingId === decision.id}
                                                    >
                                                        {deletingId === decision.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </CardContent>

            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Proposer une décision</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Titre</Label>
                            <Input
                                value={form.title}
                                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                placeholder="Ex: Augmenter le budget formation"
                            />
                        </div>
                        <div>
                            <Label>Description (optionnel)</Label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="Contexte et détails..."
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label>Date limite de vote (optionnel)</Label>
                            <Input
                                type="datetime-local"
                                value={form.voteDeadline}
                                onChange={(e) => setForm((f) => ({ ...f, voteDeadline: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
                        <Button onClick={handleCreate} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Proposer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editingDecision} onOpenChange={(o) => !o && setEditingDecision(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modifier la décision</DialogTitle>
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
                            <Label>Description</Label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label>Date limite de vote</Label>
                            <Input
                                type="datetime-local"
                                value={form.voteDeadline}
                                onChange={(e) => setForm((f) => ({ ...f, voteDeadline: e.target.value }))}
                            />
                        </div>
                        {canManage && editingDecision?.status === 'PENDING' && (
                            <div>
                                <Label>Clôturer le vote</Label>
                                <Select value={statusForm} onValueChange={setStatusForm}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Statut" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PENDING">En attente</SelectItem>
                                        <SelectItem value="APPROVED">Approuvée</SelectItem>
                                        <SelectItem value="REJECTED">Rejetée</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingDecision(null)}>Annuler</Button>
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
