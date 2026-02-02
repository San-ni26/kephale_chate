"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Calendar, Users, MapPin, Building2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { toast } from "sonner";

interface EventData {
    id: string;
    title: string;
    description?: string;
    eventType: string;
    eventDate: string;
    maxAttendees: number;
    imageUrl?: string;
    organization: {
        name: string;
        logo?: string;
    };
    rsvpCount: number;
    isFull: boolean;
}

export default function PublicEventPage() {
    const params = useParams();
    const token = params.token as string;

    const [event, setEvent] = useState<EventData | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");

    useEffect(() => {
        if (token) {
            fetchEvent();
        }
    }, [token]);

    const fetchEvent = async () => {
        try {
            const res = await fetch(`/api/events/${token}`);
            if (res.ok) {
                const data = await res.json();
                setEvent(data.event);
            } else {
                toast.error('Événement non trouvé');
            }
        } catch (error) {
            console.error('Error fetching event:', error);
            toast.error('Erreur lors du chargement de l\'événement');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitRSVP = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name || !phone) {
            toast.error('Veuillez remplir tous les champs');
            return;
        }

        if (phone.length < 10) {
            toast.error('Numéro de téléphone invalide');
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch(`/api/events/${token}/rsvp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone }),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Erreur lors de la confirmation');
                return;
            }

            toast.success('Votre présence a été confirmée avec succès !');
            setSubmitted(true);

            // Update event data
            if (event) {
                setEvent({
                    ...event,
                    rsvpCount: data.rsvpCount,
                    isFull: data.spotsRemaining === 0,
                });
            }

        } catch (error) {
            console.error('Error submitting RSVP:', error);
            toast.error('Erreur lors de la confirmation');
        } finally {
            setSubmitting(false);
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
            PROFESSIONAL: 'from-blue-600 to-blue-700',
            DINNER: 'from-orange-600 to-orange-700',
            MEETING: 'from-purple-600 to-purple-700',
            PARTY: 'from-pink-600 to-pink-700',
            CONFERENCE: 'from-green-600 to-green-700',
            WORKSHOP: 'from-yellow-600 to-yellow-700',
            OTHER: 'from-slate-600 to-slate-700',
        };
        return colors[type] || 'from-slate-600 to-slate-700';
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
                <div className="text-slate-400">Chargement...</div>
            </div>
        );
    }

    if (!event) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
                <Card className="bg-slate-900 border-slate-800 max-w-md">
                    <CardContent className="pt-6 text-center">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-white mb-2">Événement non trouvé</h2>
                        <p className="text-slate-400">Le lien d'invitation est invalide ou a expiré.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-12 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Event Header */}
                <Card className="bg-slate-900 border-slate-800 overflow-hidden mb-6">
                    {event.imageUrl && (
                        <div className="w-full h-64 md:h-80 overflow-hidden">
                            <img
                                src={event.imageUrl}
                                alt={event.title}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}

                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <CardTitle className="text-3xl mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                                    {event.title}
                                </CardTitle>
                                <div className="flex items-center gap-2 text-slate-400">
                                    {event.organization.logo ? (
                                        <img
                                            src={event.organization.logo}
                                            alt={event.organization.name}
                                            className="w-6 h-6 rounded-full"
                                        />
                                    ) : (
                                        <Building2 className="w-5 h-5" />
                                    )}
                                    <span>{event.organization.name}</span>
                                </div>
                            </div>
                            <span
                                className={`px-3 py-1.5 rounded-full text-sm font-semibold text-white bg-gradient-to-r ${getEventTypeColor(
                                    event.eventType
                                )}`}
                            >
                                {getEventTypeLabel(event.eventType)}
                            </span>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {event.description && (
                            <p className="text-slate-300">{event.description}</p>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-center gap-3 text-slate-300">
                                <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center">
                                    <Calendar className="w-5 h-5 text-purple-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400">Date et heure</p>
                                    <p className="font-medium">
                                        {new Date(event.eventDate).toLocaleDateString('fr-FR', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}
                                    </p>
                                    <p className="text-sm">
                                        {new Date(event.eventDate).toLocaleTimeString('fr-FR', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 text-slate-300">
                                <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400">Participants</p>
                                    <p className="font-medium">
                                        {event.rsvpCount} / {event.maxAttendees} confirmés
                                    </p>
                                    <div className="w-32 bg-slate-800 rounded-full h-2 mt-1">
                                        <div
                                            className="bg-blue-600 h-2 rounded-full transition-all"
                                            style={{
                                                width: `${Math.min((event.rsvpCount / event.maxAttendees) * 100, 100)}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* RSVP Form */}
                {submitted ? (
                    <Card className="bg-gradient-to-br from-green-900/20 to-green-800/20 border-green-700">
                        <CardContent className="pt-6 text-center">
                            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-white mb-2">Confirmation réussie !</h2>
                            <p className="text-slate-300">
                                Merci {name}, votre présence a été enregistrée. Nous avons hâte de vous voir !
                            </p>
                        </CardContent>
                    </Card>
                ) : event.isFull ? (
                    <Card className="bg-gradient-to-br from-red-900/20 to-red-800/20 border-red-700">
                        <CardContent className="pt-6 text-center">
                            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-white mb-2">Événement complet</h2>
                            <p className="text-slate-300">
                                Désolé, cet événement a atteint sa capacité maximale. Aucune nouvelle inscription n'est possible.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-xl">Confirmer votre présence</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmitRSVP} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom complet *</Label>
                                    <Input
                                        id="name"
                                        type="text"
                                        placeholder="Jean Dupont"
                                        className="bg-slate-800 border-slate-700 text-white"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Numéro de téléphone *</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        placeholder="0612345678"
                                        className="bg-slate-800 border-slate-700 text-white"
                                        value={phone}
                                        onChange={(e) => {
                                            const value = e.target.value.replace(/\D/g, '');
                                            setPhone(value);
                                        }}
                                        required
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                                    disabled={submitting}
                                >
                                    {submitting ? 'Confirmation...' : 'Confirmer ma présence'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
