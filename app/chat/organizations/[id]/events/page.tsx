"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Calendar, Plus, ArrowLeft, Users, Copy, Check, Trash2, Edit } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/src/components/ui/card";
import { toast } from "sonner";
import EventCreationDialog from "@/src/components/events/EventCreationDialog";

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
    const orgId = params.id as string;

    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    useEffect(() => {
        if (orgId) {
            fetchEvents();
        }
    }, [orgId]);

    const fetchEvents = async () => {
        try {
            const res = await fetch(`/api/organizations/${orgId}/events`);
            if (res.ok) {
                const data = await res.json();
                setEvents(data.events || []);
            }
        } catch (error) {
            console.error('Error fetching events:', error);
            toast.error('Erreur lors du chargement des événements');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSuccess = () => {
        setShowCreateDialog(false);
        fetchEvents();
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
            fetchEvents();
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
        const colors: Record<string, string> = {
            PROFESSIONAL: 'bg-blue-600',
            DINNER: 'bg-orange-600',
            MEETING: 'bg-purple-600',
            PARTY: 'bg-pink-600',
            CONFERENCE: 'bg-green-600',
            WORKSHOP: 'bg-yellow-600',
            OTHER: 'bg-slate-600',
        };
        return colors[type] || 'bg-slate-600';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-slate-400">Chargement...</div>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/chat/organizations/${orgId}`)}
                        className="hover:bg-slate-800"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                        Événements
                    </h1>
                </div>

                <Button
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={() => setShowCreateDialog(true)}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Nouvel Événement
                </Button>
            </div>

            {/* Events Grid */}
            {events.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {events.map((event) => (
                        <Card key={event.id} className="bg-slate-900 border-slate-800 hover:border-purple-500/50 transition">
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
                                    <CardTitle className="text-lg">{event.title}</CardTitle>
                                    <span
                                        className={`px-2 py-1 rounded text-xs font-semibold text-white ${getEventTypeColor(
                                            event.eventType
                                        )}`}
                                    >
                                        {getEventTypeLabel(event.eventType)}
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {event.description && (
                                    <p className="text-sm text-slate-400 line-clamp-2">{event.description}</p>
                                )}
                                <div className="flex items-center gap-2 text-sm text-slate-400">
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
                                    <Users className="w-4 h-4 text-slate-400" />
                                    <span className="text-slate-200">
                                        {event._count.rsvps} / {event.maxAttendees} confirmés
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 rounded-full h-2">
                                    <div
                                        className="bg-purple-600 h-2 rounded-full transition-all"
                                        style={{
                                            width: `${Math.min((event._count.rsvps / event.maxAttendees) * 100, 100)}%`,
                                        }}
                                    />
                                </div>
                            </CardContent>
                            <CardFooter className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 border-slate-700 hover:bg-slate-800"
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
                                            Copier le lien
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-red-700 hover:bg-red-900/20 text-red-400"
                                    onClick={() => handleDeleteEvent(event.id)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-lg">
                    <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400">Aucun événement</p>
                    <p className="text-sm text-slate-500 mb-4">Créez votre premier événement pour commencer</p>
                    <Button
                        className="bg-purple-600 hover:bg-purple-700"
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
        </div>
    );
}
