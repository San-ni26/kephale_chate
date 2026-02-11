'use client';

import { useState } from 'react';
import { Calendar, Plus, Pencil, Trash2, Loader2, FileText } from 'lucide-react';
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
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface DepartmentMeeting {
    id: string;
    title: string;
    description?: string | null;
    agenda?: string | null;
    meetingDate: string;
    location?: string | null;
    minutes?: string | null;
    minutesAt?: string | null;
    creator: { id: string; name: string | null; email: string };
}

export default function DepartmentMeetingsTab({
    orgId,
    deptId,
    canManage,
}: {
    orgId: string;
    deptId: string;
    canManage: boolean;
}) {
    const [showCreate, setShowCreate] = useState(false);
    const [editingMeeting, setEditingMeeting] = useState<DepartmentMeeting | null>(null);
    const [minutesMeeting, setMinutesMeeting] = useState<DepartmentMeeting | null>(null);
    const [form, setForm] = useState({
        title: '',
        description: '',
        agenda: '',
        meetingDate: '',
        location: '',
    });
    const [minutesContent, setMinutesContent] = useState('');
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const { data: meetingsData, mutate } = useSWR<{ meetings: DepartmentMeeting[] }>(
        `/api/organizations/${orgId}/departments/${deptId}/meetings`,
        fetcher
    );
    const meetings = meetingsData?.meetings ?? [];

    const handleCreate = async () => {
        if (!form.title.trim() || !form.meetingDate) {
            toast.error('Titre et date requis');
            return;
        }
        setSaving(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/meetings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, agenda: form.agenda || null, location: form.location || null }),
            });
            if (res.ok) {
                toast.success('Réunion créée');
                setShowCreate(false);
                setForm({ title: '', description: '', agenda: '', meetingDate: '', location: '' });
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
        if (!editingMeeting) return;
        setSaving(true);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/meetings/${editingMeeting.id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form),
                }
            );
            if (res.ok) {
                toast.success('Réunion mise à jour');
                setEditingMeeting(null);
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

    const handleSaveMinutes = async () => {
        if (!minutesMeeting) return;
        setSaving(true);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/meetings/${minutesMeeting.id}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ minutes: minutesContent }),
                }
            );
            if (res.ok) {
                toast.success('Compte-rendu enregistré');
                setMinutesMeeting(null);
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

    const handleDelete = async (meeting: DepartmentMeeting) => {
        if (!confirm(`Supprimer la réunion « ${meeting.title} » ?`)) return;
        setDeletingId(meeting.id);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/meetings/${meeting.id}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                toast.success('Réunion supprimée');
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

    const openEdit = (meeting: DepartmentMeeting) => {
        setEditingMeeting(meeting);
        setForm({
            title: meeting.title,
            description: meeting.description || '',
            agenda: meeting.agenda || '',
            meetingDate: meeting.meetingDate ? format(new Date(meeting.meetingDate), 'yyyy-MM-dd\'T\'HH:mm') : '',
            location: meeting.location || '',
        });
    };

    const openMinutes = (meeting: DepartmentMeeting) => {
        setMinutesMeeting(meeting);
        setMinutesContent(meeting.minutes || '');
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Réunions & comptes-rendus
                    </CardTitle>
                    {canManage && (
                        <Button size="sm" onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            <Plus className="w-4 h-4 mr-2" />
                            Nouvelle réunion
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {meetings.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                        <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">Aucune réunion</p>
                        {canManage && (
                            <Button size="sm" onClick={() => setShowCreate(true)} className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
                                <Plus className="w-4 h-4 mr-2" />
                                Créer une réunion
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {meetings.map((meeting) => (
                            <Card key={meeting.id} className="bg-muted/30 border-border">
                                <CardContent className="pt-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-foreground">{meeting.title}</h3>
                                            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                                <Calendar className="w-4 h-4" />
                                                {format(new Date(meeting.meetingDate), 'EEEE d MMMM yyyy à HH:mm', { locale: fr })}
                                            </div>
                                            {meeting.location && (
                                                <p className="text-sm text-muted-foreground mt-1">{meeting.location}</p>
                                            )}
                                            {meeting.minutes && (
                                                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                                                    <FileText className="w-4 h-4" />
                                                    Compte-rendu enregistré
                                                    {meeting.minutesAt && ` le ${format(new Date(meeting.minutesAt), 'd MMM yyyy', { locale: fr })}`}
                                                </p>
                                            )}
                                            <p className="text-xs text-muted-foreground mt-2">
                                                Par {meeting.creator.name || meeting.creator.email}
                                            </p>
                                        </div>
                                        {canManage && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button variant="outline" size="sm" onClick={() => openMinutes(meeting)}>
                                                    <FileText className="w-4 h-4 mr-1" />
                                                    CR
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(meeting)}>
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => handleDelete(meeting)}
                                                    disabled={deletingId === meeting.id}
                                                >
                                                    {deletingId === meeting.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
                        <DialogTitle>Nouvelle réunion</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Titre</Label>
                            <Input
                                value={form.title}
                                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                placeholder="Ex: Réunion hebdomadaire"
                            />
                        </div>
                        <div>
                            <Label>Date et heure</Label>
                            <Input
                                type="datetime-local"
                                value={form.meetingDate}
                                onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label>Lieu (optionnel)</Label>
                            <Input
                                value={form.location}
                                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                                placeholder="Salle, vidéo..."
                            />
                        </div>
                        <div>
                            <Label>Ordre du jour (optionnel)</Label>
                            <Textarea
                                value={form.agenda}
                                onChange={(e) => setForm((f) => ({ ...f, agenda: e.target.value }))}
                                placeholder="1. Point 1 ..."
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label>Description (optionnel)</Label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="Détails..."
                                rows={2}
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

            <Dialog open={!!editingMeeting} onOpenChange={(o) => !o && setEditingMeeting(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modifier la réunion</DialogTitle>
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
                            <Label>Date et heure</Label>
                            <Input
                                type="datetime-local"
                                value={form.meetingDate}
                                onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label>Lieu</Label>
                            <Input
                                value={form.location}
                                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label>Ordre du jour</Label>
                            <Textarea
                                value={form.agenda}
                                onChange={(e) => setForm((f) => ({ ...f, agenda: e.target.value }))}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingMeeting(null)}>Annuler</Button>
                        <Button onClick={handleUpdate} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!minutesMeeting} onOpenChange={(o) => !o && setMinutesMeeting(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Compte-rendu — {minutesMeeting?.title}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label>Rédigez le compte-rendu de la réunion</Label>
                        <Textarea
                            value={minutesContent}
                            onChange={(e) => setMinutesContent(e.target.value)}
                            placeholder="Résumé de la réunion, décisions prises, actions à mener..."
                            className="min-h-[300px] mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setMinutesMeeting(null)}>Annuler</Button>
                        <Button onClick={handleSaveMinutes} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Enregistrer le CR
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
