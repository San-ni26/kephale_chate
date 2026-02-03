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
        // Thème monochromatique : on utilise primary ou une couleur neutre
        return 'from-primary to-primary/80';
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-muted-foreground">Chargement...</div>
            </div>
        );
    }

    if (!event) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Card className="bg-card border-border max-w-md">
                    <CardContent className="pt-6 text-center">
                        <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-foreground mb-2">Événement non trouvé</h2>
                        <p className="text-muted-foreground">Le lien d'invitation est invalide ou a expiré.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background py-12 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Event Header */}
                <Card className="bg-card border-border overflow-hidden mb-6">
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
                                <CardTitle className="text-3xl mb-2 text-foreground">
                                    {event.title}
                                </CardTitle>
                                <div className="flex items-center gap-2 text-muted-foreground">
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
                                className={`px-3 py-1.5 rounded-full text-sm font-semibold text-primary-foreground bg-primary`}
                            >
                                {getEventTypeLabel(event.eventType)}
                            </span>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {event.description && (
                            <p className="text-muted-foreground">{event.description}</p>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                    <Calendar className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Date et heure</p>
                                    <p className="font-medium text-foreground">
                                        {new Date(event.eventDate).toLocaleDateString('fr-FR', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}
                                    </p>
                                    <p className="text-sm text-foreground">
                                        {new Date(event.eventDate).toLocaleTimeString('fr-FR', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 text-muted-foreground">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Participants</p>
                                    <p className="font-medium text-foreground">
                                        {event.rsvpCount} / {event.maxAttendees} confirmés
                                    </p>
                                    <div className="w-32 bg-muted rounded-full h-2 mt-1">
                                        <div
                                            className="bg-primary h-2 rounded-full transition-all"
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
                    <Card className="bg-primary/10 border-primary">
                        <CardContent className="pt-6 text-center">
                            <CheckCircle className="w-16 h-16 text-primary mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-foreground mb-2">Confirmation réussie !</h2>
                            <p className="text-muted-foreground">
                                Merci {name}, votre présence a été enregistrée. Nous avons hâte de vous voir !
                            </p>
                        </CardContent>
                    </Card>
                ) : event.isFull ? (
                    <Card className="bg-destructive/10 border-destructive">
                        <CardContent className="pt-6 text-center">
                            <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-foreground mb-2">Événement complet</h2>
                            <p className="text-muted-foreground">
                                Désolé, cet événement a atteint sa capacité maximale. Aucune nouvelle inscription n'est possible.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <CardTitle className="text-xl text-foreground">Confirmer votre présence</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmitRSVP} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom complet *</Label>
                                    <Input
                                        id="name"
                                        type="text"
                                        placeholder="Jean Dupont"
                                        className="bg-muted border-border text-foreground"
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
                                        className="bg-muted border-border text-foreground"
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
                                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
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
