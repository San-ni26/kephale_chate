"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Calendar, Plus, Users, Copy, Check, Trash2, MessageSquare, Building2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/src/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/src/components/ui/dialog";
import { Label } from "@/src/components/ui/label";
import { toast } from "sonner";
import EventCreationDialog from "@/src/components/events/EventCreationDialog";
import { fetchWithAuth } from "@/src/lib/auth-client";

import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";

interface Department {
    id: string;
    name: string;
    _count?: { members: number };
}

interface Event {
    id: string;
    title: string;
    description?: string;
    eventType: string;
    eventDate: string;
    maxAttendees: number;
    imageUrl?: string;
    token: string;
    _count: {
        rsvps: number;
    };
}

export default function EventsManagementPage() {
    const router = useRouter();
    const params = useParams();
    const orgId = params?.id as string;

    const { data: eventsData, mutate: mutateEvents, isLoading } = useSWR(
        orgId ? `/api/organizations/${orgId}/events` : null,
        fetcher
    );

    const events: Event[] = eventsData?.events || [];
    const loading = isLoading;

    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [broadcastEventId, setBroadcastEventId] = useState<string | null>(null);
    const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'selected'>('all');
    const [broadcastDepartmentIds, setBroadcastDepartmentIds] = useState<string[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [broadcastLoading, setBroadcastLoading] = useState(false);

    const refreshEvents = () => mutateEvents();

    useEffect(() => {
        if (!broadcastEventId || !orgId) return;
        fetcher(`/api/organizations/${orgId}/departments`)
            .then((res: { departments?: Department[] }) => setDepartments(res?.departments ?? []))
            .catch(() => toast.error('Impossible de charger les départements'));
    }, [broadcastEventId, orgId]);

    const handleBroadcastSubmit = async () => {
        if (!broadcastEventId) return;
        if (broadcastTarget === 'selected' && broadcastDepartmentIds.length === 0) {
            toast.error('Sélectionnez au moins un département');
            return;
        }
        setBroadcastLoading(true);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/events/${broadcastEventId}/broadcast`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        target: broadcastTarget,
                        ...(broadcastTarget === 'selected' ? { departmentIds: broadcastDepartmentIds } : {}),
                    }),
                }
            );
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Erreur lors de la diffusion');
                return;
            }
            toast.success(`Événement diffusé dans ${data.broadcastCount ?? 0} département(s)`);
            setBroadcastEventId(null);
            setBroadcastDepartmentIds([]);
            setBroadcastTarget('all');
        } catch {
            toast.error('Erreur lors de la diffusion');
        } finally {
            setBroadcastLoading(false);
        }
    };

    const handleCreateSuccess = () => {
        setShowCreateDialog(false);
        refreshEvents();
    };

    const handleCopyLink = (token: string) => {
        const baseUrl = window.location.origin;
        const link = `${baseUrl}/events/${token}`;
        navigator.clipboard.writeText(link);
        setCopiedToken(token);
        toast.success('Lien copié dans le presse-papiers');
        setTimeout(() => setCopiedToken(null), 2000);
    };

    const handleDeleteEvent = async (eventId: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) return;

        try {
            const res = await fetch(`/api/organizations/${orgId}/events/${eventId}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || 'Erreur lors de la suppression');
                return;
            }

            toast.success('Événement supprimé avec succès');
            refreshEvents();
        } catch (error) {
            console.error('Error deleting event:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    const getEventTypeLabel = (type: string) => {
        const types: Record<string, string> = {
            PROFESSIONAL: 'Professionnel',
            DINNER: 'Dîner',
            MEETING: 'Réunion',
            PARTY: 'Soirée',
            CONFERENCE: 'Conférence',
            WORKSHOP: 'Atelier',
            OTHER: 'Autre',
        };
        return types[type] || type;
    };

    const getEventTypeColor = (type: string) => {
        // En thème monochromatique, on garde un fond neutre ou primary
        return 'bg-secondary text-secondary-foreground';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="text-muted-foreground">Chargement...</div>
            </div>
        );
    }

    return (
        <div className="p-4 pt-20 mb-15 space-y-6 bg-background min-h-screen">
            {/* Events Grid */}
            {events.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {events.map((event) => (
                        <Card key={event.id} className="bg-card border-border hover:border-primary/50 transition">
                            {event.imageUrl && (
                                <div className="w-full h-40 overflow-hidden rounded-t-lg">
                                    <img
                                        src={event.imageUrl}
                                        alt={event.title}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            )}
                            <CardHeader>
                                <div className="flex items-start justify-between gap-2">
                                    <CardTitle className="text-lg text-foreground">{event.title}</CardTitle>
                                    <span
                                        className={`px-2 py-1 rounded text-xs font-semibold ${getEventTypeColor(
                                            event.eventType
                                        )}`}
                                    >
                                        {getEventTypeLabel(event.eventType)}
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {event.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                                )}
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Calendar className="w-4 h-4" />
                                    {new Date(event.eventDate).toLocaleDateString('fr-FR', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <Users className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-foreground">
                                        {event._count.rsvps} / {event.maxAttendees} confirmés
                                    </span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-2">
                                    <div
                                        className="bg-primary h-2 rounded-full transition-all"
                                        style={{
                                            width: `${Math.min((event._count.rsvps / event.maxAttendees) * 100, 100)}%`,
                                        }}
                                    />
                                </div>
                            </CardContent>
                            <CardFooter className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-border hover:bg-muted"
                                    onClick={() => handleCopyLink(event.token)}
                                >
                                    {copiedToken === event.token ? (
                                        <>
                                            <Check className="w-4 h-4 mr-2" />
                                            Copié
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4 mr-2" />
                                            Lien
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-border hover:bg-muted"
                                    onClick={() => setBroadcastEventId(event.id)}
                                    title="Diffuser dans les discussions des départements"
                                >
                                    <MessageSquare className="w-4 h-4 mr-1" />
                                    Diffuser
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-destructive hover:bg-destructive/10 text-destructive"
                                    onClick={() => handleDeleteEvent(event.id)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                    <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">Aucun événement</p>
                    <p className="text-sm text-muted-foreground mb-4">Créez votre premier événement pour commencer</p>
                    <Button
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => setShowCreateDialog(true)}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Créer un Événement
                    </Button>
                </div>
            )}

            {/* Create Dialog */}
            <EventCreationDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                orgId={orgId}
                onSuccess={handleCreateSuccess}
            />

            {/* Dialog Diffuser l'événement dans les discussions */}
            <Dialog open={!!broadcastEventId} onOpenChange={(open) => !open && setBroadcastEventId(null)}>
                <DialogContent className="bg-card border-border text-foreground max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="w-5 h-5" />
                            Diffuser dans les discussions
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        L'événement sera affiché en haut de la discussion des départements choisis jusqu'à sa date de fin ou sa suppression.
                    </p>
                    <div className="space-y-3 py-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="broadcastTarget"
                                checked={broadcastTarget === 'all'}
                                onChange={() => setBroadcastTarget('all')}
                                className="h-4 w-4"
                            />
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">Tous les départements</span>
                            {departments.length > 0 && (
                                <span className="text-xs text-muted-foreground">({departments.length})</span>
                            )}
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="broadcastTarget"
                                checked={broadcastTarget === 'selected'}
                                onChange={() => setBroadcastTarget('selected')}
                                className="h-4 w-4"
                            />
                            <span className="text-sm">Sélectionner les départements</span>
                        </label>
                        {broadcastTarget === 'selected' && departments.length > 0 && (
                            <div className="max-h-36 overflow-y-auto rounded border border-border bg-muted/30 p-2 space-y-1">
                                {departments.map((d) => (
                                    <label
                                        key={d.id}
                                        className="flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded hover:bg-muted"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={broadcastDepartmentIds.includes(d.id)}
                                            onChange={(e) =>
                                                setBroadcastDepartmentIds((prev) =>
                                                    e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id)
                                                )
                                            }
                                            className="h-4 w-4 rounded border-border"
                                        />
                                        <span className="text-sm">{d.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setBroadcastEventId(null)}
                            disabled={broadcastLoading}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleBroadcastSubmit}
                            disabled={broadcastLoading || (broadcastTarget === 'selected' && broadcastDepartmentIds.length === 0)}
                        >
                            {broadcastLoading ? 'Envoi...' : 'Diffuser'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
