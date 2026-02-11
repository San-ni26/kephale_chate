'use client';

import { useState } from 'react';
import { BarChart3, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/src/components/ui/dialog';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface DepartmentPoll {
    id: string;
    question: string;
    options: string[];
    endDate?: string | null;
    votes: { userId: string; optionIndex: number }[];
    creator: { id: string; name: string | null; email: string };
}

export default function DepartmentPollsTab({
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
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [endDate, setEndDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [votingPollId, setVotingPollId] = useState<string | null>(null);

    const { data: pollsData, mutate } = useSWR<{ polls: DepartmentPoll[] }>(
        `/api/organizations/${orgId}/departments/${deptId}/polls`,
        fetcher
    );
    const polls = pollsData?.polls ?? [];

    const handleCreate = async () => {
        const opts = options.filter((o) => o.trim());
        if (!question.trim() || opts.length < 2) {
            toast.error('Question et au moins 2 options requises');
            return;
        }
        setSaving(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/polls`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: question.trim(), options: opts, endDate: endDate || null }),
            });
            if (res.ok) {
                toast.success('Sondage créé');
                setShowCreate(false);
                setQuestion('');
                setOptions(['', '']);
                setEndDate('');
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

    const handleVote = async (pollId: string, optionIndex: number) => {
        setVotingPollId(pollId);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/polls/${pollId}/vote`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ optionIndex }),
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
            setVotingPollId(null);
        }
    };

    const handleDelete = async (poll: DepartmentPoll) => {
        if (!confirm(`Supprimer le sondage « ${poll.question} » ?`)) return;
        setDeletingId(poll.id);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/polls/${poll.id}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                toast.success('Sondage supprimé');
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

    const addOption = () => setOptions((o) => [...o, '']);
    const updateOption = (i: number, v: string) => {
        setOptions((o) => {
            const next = [...o];
            next[i] = v;
            return next;
        });
    };
    const removeOption = (i: number) => {
        if (options.length <= 2) return;
        setOptions((o) => o.filter((_, i2) => i2 !== i));
    };

    const getVoteCount = (poll: DepartmentPoll, optionIndex: number) =>
        poll.votes.filter((v) => v.optionIndex === optionIndex).length;

    const getUserVote = (poll: DepartmentPoll) =>
        poll.votes.find((v) => v.userId === currentUser?.id)?.optionIndex;

    const isPollOver = (poll: DepartmentPoll) =>
        poll.endDate && new Date(poll.endDate) < new Date();

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Sondages rapides
                    </CardTitle>
                    {canManage && (
                        <Button size="sm" onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            <Plus className="w-4 h-4 mr-2" />
                            Nouveau sondage
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {polls.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                        <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">Aucun sondage</p>
                        {canManage && (
                            <Button size="sm" onClick={() => setShowCreate(true)} className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
                                <Plus className="w-4 h-4 mr-2" />
                                Créer un sondage
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {polls.map((poll) => {
                            const over = isPollOver(poll);
                            const myVote = getUserVote(poll);
                            const totalVotes = poll.votes.length;

                            return (
                                <Card key={poll.id} className="bg-muted/30 border-border">
                                    <CardContent className="pt-6">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-foreground">{poll.question}</h3>
                                                {poll.endDate && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {over ? 'Terminé' : 'Clôture'} : {format(new Date(poll.endDate), 'd MMM yyyy', { locale: fr })}
                                                    </p>
                                                )}
                                                <div className="mt-3 space-y-2">
                                                    {(poll.options as string[]).map((opt, i) => {
                                                        const count = getVoteCount(poll, i);
                                                        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                                                        const voted = myVote === i;

                                                        return (
                                                            <div key={i} className="space-y-1">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-sm">{opt}</span>
                                                                    <span className="text-sm font-medium">{count} vote{count !== 1 ? 's' : ''} ({pct}%)</span>
                                                                </div>
                                                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full transition-all ${voted ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                                                                        style={{ width: `${pct}%` }}
                                                                    />
                                                                </div>
                                                                {!over && (
                                                                    <Button
                                                                        variant={voted ? 'secondary' : 'outline'}
                                                                        size="sm"
                                                                        className="mt-1"
                                                                        onClick={() => handleVote(poll.id, i)}
                                                                        disabled={votingPollId === poll.id}
                                                                    >
                                                                        {votingPollId === poll.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                                                        {voted ? 'Votre vote' : 'Voter'}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    Par {poll.creator.name || poll.creator.email}
                                                </p>
                                            </div>
                                            {canManage && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive shrink-0 ml-2"
                                                    onClick={() => handleDelete(poll)}
                                                    disabled={deletingId === poll.id}
                                                >
                                                    {deletingId === poll.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </Button>
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
                        <DialogTitle>Nouveau sondage</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Question</Label>
                            <Input
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="Ex: Quelle date pour la sortie ?"
                            />
                        </div>
                        <div>
                            <Label>Options</Label>
                            <div className="space-y-2">
                                {options.map((opt, i) => (
                                    <div key={i} className="flex gap-2">
                                        <Input
                                            value={opt}
                                            onChange={(e) => updateOption(i, e.target.value)}
                                            placeholder={`Option ${i + 1}`}
                                        />
                                        <Button size="icon" variant="ghost" onClick={() => removeOption(i)} disabled={options.length <= 2}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={addOption}>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Ajouter une option
                                </Button>
                            </div>
                        </div>
                        <div>
                            <Label>Date de clôture (optionnel)</Label>
                            <Input
                                type="datetime-local"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
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
        </Card>
    );
}
