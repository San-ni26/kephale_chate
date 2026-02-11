"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { toast } from "sonner";
import { Check, User, Phone } from "lucide-react";

interface InvitationClientProps {
    initialInvitation?: any;
}

export default function InvitationClient({ initialInvitation }: InvitationClientProps) {
    const params = useParams();
    const router = useRouter();
    const token = params?.token as string;

    const [loading, setLoading] = useState(!initialInvitation);
    const [invitation, setInvitation] = useState<any>(initialInvitation || null);
    const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "success" | "full">(initialInvitation ? "valid" : "loading");

    // Form state
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (initialInvitation) {
            if (initialInvitation.maxGuests && initialInvitation._count.guests >= initialInvitation.maxGuests) {
                setStatus("full");
            } else {
                setStatus("valid");
            }
            setLoading(false);
        }
    }, [initialInvitation]);

    useEffect(() => {
        if (!token || initialInvitation) return;

        const fetchInvitation = async () => {
            try {
                const res = await fetch(`/api/invitations/${token}`);
                if (res.ok) {
                    const data = await res.json();
                    const inv = data.invitation;
                    setInvitation(inv);

                    if (inv.maxGuests && inv._count.guests >= inv.maxGuests) {
                        setStatus("full");
                    } else {
                        setStatus("valid");
                    }
                } else {
                    setStatus("invalid");
                }
            } catch (error) {
                setStatus("invalid");
            } finally {
                setLoading(false);
            }
        };

        fetchInvitation();
    }, [token, initialInvitation]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name || !phone) {
            toast.error("Veuillez remplir tous les champs");
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`/api/invitations/${token}/confirm`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, phone }),
            });

            if (res.ok) {
                setStatus("success");
                toast.success("Présence confirmée !");
            } else {
                const data = await res.json();
                toast.error(data.error || "Erreur lors de la confirmation");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <p className="text-muted-foreground">Chargement...</p>
            </div>
        );
    }

    if (status === "invalid") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="w-full max-w-md text-center p-6 space-y-4">
                    <h1 className="text-2xl font-bold text-destructive">Invitation Invalide</h1>
                    <p className="text-muted-foreground">Ce lien est invalide ou a expiré.</p>
                </Card>
            </div>
        );
    }

    if (status === "full") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="w-full max-w-md text-center p-6 space-y-4">
                    <h1 className="text-2xl font-bold text-orange-500">Complet</h1>
                    <p className="text-muted-foreground">Désolé, le nombre maximum d'invités a été atteint pour cet événement.</p>
                    <div className="pt-4">
                        <div className="mx-auto w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden mb-2">
                            {invitation?.user?.avatarUrl ? (
                                <img src={invitation.user.avatarUrl} alt="Host" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-12 h-12 text-muted-foreground" />
                            )}
                        </div>
                        <p className="font-medium">Organisé par {invitation?.user?.name}</p>
                    </div>
                </Card>
            </div>
        );
    }

    if (status === "success") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="w-full max-w-md text-center p-6 space-y-6">
                    <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto">
                        <Check className="w-8 h-8 text-success" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">Confirmation Reçue !</h1>
                    <p className="text-muted-foreground">
                        Merci <strong>{name}</strong>, votre présence a bien été confirmée auprès de <strong>{invitation?.user?.name}</strong>.
                    </p>
                    <p className="text-sm text-muted-foreground pt-4">Vous pouvez fermer cette page.</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 py-8">
            <Card className="w-full max-w-lg shadow-lg border-border overflow-hidden">
                {invitation?.imageBase64 && (
                    <div className="w-full h-48 sm:h-64 bg-muted relative">
                        <img
                            src={invitation.imageBase64}
                            alt="Invitation"
                            className="w-full h-full object-contain bg-black/5"
                        />
                    </div>
                )}

                <CardHeader className="text-center space-y-2 pb-2">
                    {!invitation?.imageBase64 && (
                        <div className="mx-auto">
                            <Avatar className="w-20 h-20 border-2 border-primary">
                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${invitation?.user?.name}`} />
                                <AvatarFallback>{invitation?.user?.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                        </div>
                    )}
                    <CardTitle className="text-2xl pt-2 font-bold">{invitation?.title}</CardTitle>
                    <p className="text-sm font-medium text-primary uppercase tracking-wide">{invitation?.type}</p>
                    <p className="text-sm text-muted-foreground">Invité(e) par {invitation?.user?.name}</p>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="space-y-3 text-center text-sm">
                        {invitation?.description && (
                            <p className="bg-muted p-3 rounded-md text-foreground italic">"{invitation.description}"</p>
                        )}
                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <div className="bg-muted/50 p-2 rounded border border-border">
                                <p className="text-xs text-muted-foreground font-semibold">DATE</p>
                                <p className="font-medium">{new Date(invitation?.date).toLocaleDateString()}</p>
                                <p className="text-xs">{new Date(invitation?.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                            <div className="bg-muted/50 p-2 rounded border border-border">
                                <p className="text-xs text-muted-foreground font-semibold">LIEU</p>
                                <p className="font-medium">{invitation?.location}</p>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-border pt-4">
                        <h3 className="text-center font-semibold mb-4">Confirmer votre présence</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Votre Nom & Prénom</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="name"
                                        placeholder="Ex: Jean Kouassi"
                                        className="pl-9"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Votre Numéro de Téléphone</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="phone"
                                        placeholder="Ex: 0707070707"
                                        className="pl-9"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={submitting}>
                                {submitting ? "Confirmation..." : "Confirmer ma présence"}
                            </Button>
                        </form>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
