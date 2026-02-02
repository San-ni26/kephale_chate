"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface OrganizationRequestDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export default function OrganizationRequestDialog({
    open,
    onOpenChange,
    onSuccess,
}: OrganizationRequestDialogProps) {
    const [cardCode, setCardCode] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (cardCode.length !== 12) {
            toast.error("Le code de carte doit contenir exactement 12 chiffres");
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/organizations/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardCode }),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Erreur lors de la soumission de la demande');
                return;
            }

            toast.success('Demande envoyée avec succès ! En attente d\'approbation.');
            setCardCode("");
            onSuccess();

        } catch (error) {
            console.error('Error submitting request:', error);
            toast.error('Erreur lors de la soumission de la demande');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
                <DialogHeader>
                    <DialogTitle>Créer une Organisation</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Entrez votre code de carte à 12 chiffres pour soumettre une demande de création d'organisation.
                        Un administrateur examinera votre demande.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="cardCode">Code de Carte (12 chiffres)</Label>
                        <Input
                            id="cardCode"
                            type="text"
                            placeholder="123456789012"
                            className="bg-slate-800 border-slate-700 text-white"
                            value={cardCode}
                            onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '').slice(0, 12);
                                setCardCode(value);
                            }}
                            maxLength={12}
                            required
                        />
                        <p className="text-xs text-slate-400">
                            {cardCode.length}/12 chiffres
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1 border-slate-700 hover:bg-slate-800"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Annuler
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 bg-purple-600 hover:bg-purple-700"
                            disabled={loading || cardCode.length !== 12}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Envoi...
                                </>
                            ) : (
                                'Envoyer la Demande'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
