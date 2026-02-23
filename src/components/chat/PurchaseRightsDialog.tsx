'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import {
    DISCUSSION_RIGHT_DURATIONS,
    type DiscussionRightDuration,
} from '@/src/lib/discussion-rights-constants';
import { Crown, CreditCard, Loader2, Clock } from 'lucide-react';

interface PendingRightsPayment {
    id: string;
    plan: string;
    createdAt: string;
}

interface PendingRightsOrder {
    id: string;
    plan: string;
    amountFcfa: number;
    createdAt: string;
}

interface PurchaseRightsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    discussionId: string;
    onSuccess?: () => void;
    pendingRightsPayment?: PendingRightsPayment | null;
    pendingRightsOrder?: PendingRightsOrder | null;
}

const DURATIONS: DiscussionRightDuration[] = [
    'THREE_MONTHS',
    'SIX_MONTHS',
    'TWELVE_MONTHS',
];

export function PurchaseRightsDialog({
    open,
    onOpenChange,
    discussionId,
    onSuccess,
    pendingRightsPayment,
    pendingRightsOrder,
}: PurchaseRightsDialogProps) {
    const [selectedDuration, setSelectedDuration] = useState<DiscussionRightDuration>('THREE_MONTHS');
    const [loading, setLoading] = useState(false);

    const handlePurchase = async (resume = false) => {
        if (!discussionId) return;
        setLoading(true);
        try {
            const duration = resume && pendingRightsPayment?.plan
                ? pendingRightsPayment.plan as DiscussionRightDuration
                : selectedDuration;
            const res = await fetchWithAuth(`/api/conversations/${discussionId}/purchase-rights`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration, resume }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                if (data.mode === 'CINETPAY' && data.paymentUrl) {
                    toast.success('Redirection vers le paiement...');
                    window.location.href = data.paymentUrl;
                    return;
                }
                if (data.mode === 'MANUAL') {
                    toast.success(data.message || 'Demande envoyée. Un administrateur traitera votre paiement.');
                    onOpenChange(false);
                    onSuccess?.();
                }
            } else {
                toast.error(data.error || "Erreur lors de l'achat");
                if (res.status === 409) onSuccess?.();
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setLoading(false);
        }
    };

    const isPendingOrder = !!pendingRightsOrder;
    const isPendingPayment = !!pendingRightsPayment && !isPendingOrder;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-background border-border text-foreground">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Crown className="w-5 h-5 text-amber-500" />
                        Acheter les droits de la discussion
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {isPendingOrder ? (
                        <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <div>
                                <p className="font-medium text-foreground">Demande en attente</p>
                                <p className="text-xs text-muted-foreground">
                                    Votre demande d&apos;achat ({pendingRightsOrder.amountFcfa.toLocaleString('fr-FR')} FCFA) est en cours de traitement par un administrateur. Vous ne pouvez pas envoyer une nouvelle demande.
                                </p>
                            </div>
                        </div>
                    ) : isPendingPayment ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                                <div>
                                    <p className="font-medium text-foreground">Paiement en cours</p>
                                    <p className="text-xs text-muted-foreground">
                                        Complétez le paiement ou réessayez si le lien a expiré.
                                    </p>
                                </div>
                            </div>
                            <Button
                                className="w-full"
                                onClick={() => handlePurchase(true)}
                                disabled={loading}
                            >
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        Compléter le paiement
                                    </>
                                )}
                            </Button>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground">
                                En achetant les droits, vous obtiendrez le contrôle total de cette discussion :
                                verrouillage, masquage et suppression. L&apos;autre utilisateur perdra ces droits.
                            </p>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Durée et tarif</label>
                                <div className="flex gap-2 flex-wrap">
                                    {DURATIONS.map((d) => {
                                        const config = DISCUSSION_RIGHT_DURATIONS[d];
                                        return (
                                            <Button
                                                key={d}
                                                variant={selectedDuration === d ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => setSelectedDuration(d)}
                                            >
                                                {config.label} — {config.priceFcfa.toLocaleString('fr-FR')} FCFA
                                            </Button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                {!isPendingOrder && (
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>
                            {isPendingPayment ? 'Fermer' : 'Annuler'}
                        </Button>
                        {!isPendingPayment && (
                            <Button onClick={() => handlePurchase(false)} disabled={loading}>
                                {loading ? 'Paiement...' : 'Payer'}
                            </Button>
                        )}
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
