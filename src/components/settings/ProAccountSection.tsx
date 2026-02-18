'use client';

import { useState, useEffect } from 'react';
import { Crown, Loader2, CreditCard, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/card';
import { Label } from '@/src/components/ui/label';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { USER_PRO_PLANS, type UserProPlan } from '@/src/lib/user-pro';

interface ProStatus {
    isPro: boolean;
    subscription: {
        plan: string;
        endDate: string;
    } | null;
    settings: {
        blurOldMessages: boolean;
        preventScreenshot: boolean;
    };
    pendingOrder?: {
        id: string;
        plan: string;
        amountFcfa: number;
        createdAt: string;
    } | null;
    pendingPayment?: {
        id: string;
        plan: string;
        createdAt: string;
    } | null;
}

export function ProAccountSection() {
    const [status, setStatus] = useState<ProStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [subscribing, setSubscribing] = useState<string | null>(null);
    const [paymentMode, setPaymentMode] = useState<'CINETPAY' | 'MANUAL'>('CINETPAY');

    const fetchStatus = async () => {
        try {
            const res = await fetchWithAuth('/api/user-pro/status');
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
            }
        } catch {
            setStatus(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchPaymentMode = async () => {
        try {
            const res = await fetchWithAuth('/api/payments/mode');
            if (res.ok) {
                const { mode } = await res.json();
                setPaymentMode(mode || 'CINETPAY');
            }
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        fetchStatus();
        fetchPaymentMode();
        const interval = setInterval(fetchStatus, 30000); // Rafraîchir toutes les 30s
        return () => clearInterval(interval);
    }, []);

    const handleSubscribe = async (plan: UserProPlan) => {
        setSubscribing(plan);
        try {
            const res = await fetchWithAuth('/api/user-pro/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                toast.error(data.error || 'Erreur lors de la souscription');
                if (res.status === 409) fetchStatus(); // Rafraîchir pour afficher l'état "en attente"
                return;
            }

            if (data.mode === 'CINETPAY' && data.paymentUrl) {
                toast.success('Redirection vers le paiement...');
                window.location.href = data.paymentUrl;
                return;
            }

            if (data.mode === 'MANUAL') {
                toast.success('Demande envoyée. Un administrateur traitera votre paiement.');
                fetchStatus();
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setSubscribing(null);
        }
    };

    const handleSettingsChange = async (key: 'blurOldMessages' | 'preventScreenshot', value: boolean) => {
        if (!status?.isPro) return;

        try {
            const res = await fetchWithAuth('/api/user-pro/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value }),
            });

            if (res.ok) {
                setStatus((prev) =>
                    prev ? { ...prev, settings: { ...prev.settings, [key]: value } } : null
                );
                toast.success('Paramètre mis à jour');
            } else {
                toast.error('Erreur lors de la mise à jour');
            }
        } catch {
            toast.error('Erreur réseau');
        }
    };

    const hasPendingRequest = !!(status?.pendingOrder || status?.pendingPayment);

    if (loading) {
        return (
            <Card className="bg-card border-border">
                <CardHeader>
                    <CardTitle className="text-sm uppercase text-muted-foreground font-bold flex items-center gap-2">
                        <Crown className="h-4 w-4" /> Compte Pro
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-sm uppercase text-muted-foreground font-bold flex items-center gap-2">
                    <Crown className="h-4 w-4" /> Compte Pro
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {status?.isPro ? (
                    <>
                        <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
                            <CheckCircle className="h-5 w-5 text-primary" />
                            <div>
                                <p className="font-medium text-foreground">Compte Pro actif</p>
                                <p className="text-xs text-muted-foreground">
                                    Jusqu'au {status.subscription?.endDate ? new Date(status.subscription.endDate).toLocaleDateString('fr-FR') : '—'}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="blur" className="text-sm">Flou des anciennes discussions</Label>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={status.settings.blurOldMessages}
                                    onClick={() => handleSettingsChange('blurOldMessages', !status.settings.blurOldMessages)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                                        status.settings.blurOldMessages ? 'bg-primary' : 'bg-muted'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                                            status.settings.blurOldMessages ? 'translate-x-5' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <Label htmlFor="screenshot" className="text-sm">Protection du contenu (sélection, copie)</Label>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={status.settings.preventScreenshot}
                                    onClick={() => handleSettingsChange('preventScreenshot', !status.settings.preventScreenshot)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                                        status.settings.preventScreenshot ? 'bg-primary' : 'bg-muted'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                                            status.settings.preventScreenshot ? 'translate-x-5' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>
                    </>
                ) : hasPendingRequest ? (
                    <>
                        <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <div>
                                <p className="font-medium text-foreground">Demande en attente</p>
                                <p className="text-xs text-muted-foreground">
                                    {status.pendingOrder ? (
                                        <>Votre demande d&apos;abonnement Pro ({status.pendingOrder.amountFcfa.toLocaleString('fr-FR')} FCFA) est en cours de traitement par un administrateur.</>
                                    ) : (
                                        <>Votre paiement Compte Pro est en cours. Complétez le paiement ou réessayez plus tard.</>
                                    )}
                                    {' '}Vous ne pouvez pas envoyer une nouvelle demande tant que celle-ci n&apos;est pas traitée.
                                </p>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">
                            Renforcez la sécurité de vos discussions : flou, verrouillage par code, règles de suppression.
                        </p>

                        <div className="space-y-2">
                            {Object.entries(USER_PRO_PLANS).map(([key, config]) => (
                                <div
                                    key={key}
                                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20"
                                >
                                    <div>
                                        <p className="font-medium text-foreground">{config.label}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {config.reductionPercent > 0 && `-${config.reductionPercent}% • `}
                                            {config.priceFcfa.toLocaleString('fr-FR')} FCFA
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleSubscribe(key as UserProPlan)}
                                        disabled={!!subscribing}
                                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                                    >
                                        {subscribing === key ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <>
                                                <CreditCard className="mr-2 h-4 w-4" />
                                                Payer
                                            </>
                                        )}
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <p className="text-xs text-muted-foreground">
                            Paiement via {paymentMode === 'CINETPAY' ? 'Orange Money, Moov, Wave, Carte bancaire' : 'approbation manuelle par l\'administrateur'}.
                        </p>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
