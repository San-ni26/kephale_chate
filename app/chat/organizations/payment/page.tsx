'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { Loader2, Smartphone, ArrowLeft } from 'lucide-react';

const PLAN_PRICES_FCFA: Record<string, number> = {
    BASIC: 5000,
    PROFESSIONAL: 15000,
    ENTERPRISE: 50000,
};

export default function OrganizationPaymentPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [paymentProvider, setPaymentProvider] = useState<'ORANGE_MONEY' | 'MOOV' | ''>('');
    const [paymentData, setPaymentData] = useState<{
        plan: string;
        name: string;
        logo?: string;
        address?: string;
        requestId?: string;
    } | null>(null);

    useEffect(() => {
        const stored = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('orgPaymentData');
        if (!stored) {
            toast.error('Données de paiement manquantes');
            router.push('/chat/organizations');
            return;
        }
        try {
            setPaymentData(JSON.parse(stored));
        } catch {
            router.push('/chat/organizations');
        }
    }, [router]);

    const handlePayment = async () => {
        if (!paymentData || !paymentProvider) {
            toast.error('Veuillez sélectionner un opérateur');
            return;
        }

        setLoading(true);

        try {
            const payRes = await fetchWithAuth('/api/payments/paytech/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan: paymentData.plan,
                    name: paymentData.name,
                    logo: paymentData.logo,
                    address: paymentData.address,
                    requestId: paymentData.requestId,
                    customer_name: paymentData.name,
                }),
            });

            const payData = await payRes.json();

            if (!payRes.ok || payData.status !== 'success') {
                toast.error(payData.error || 'Le paiement a échoué. Veuillez réessayer.');
                setLoading(false);
                return;
            }

            sessionStorage.removeItem('orgPaymentData');

            if (payData.paymentUrl) {
                toast.success('Redirection vers la page de paiement...');
                window.location.href = payData.paymentUrl;
                return;
            }

            toast.error('Erreur de redirection');
            setLoading(false);
        } catch (error) {
            console.error('Payment error:', error);
            toast.error('Erreur lors du paiement');
            setLoading(false);
        }
    };

    if (!paymentData) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const base = PLAN_PRICES_FCFA[paymentData.plan] ?? 0;
    const feeRate = 0.02;
    const total = Math.round(base * (1 + feeRate));

    return (
        <div className="min-h-screen bg-background mt-14 md:mt-16 pb-20">
            <div className="max-w-md mx-auto px-4 py-8">
                <Button
                    variant="ghost"
                    size="sm"
                    className="mb-6 text-muted-foreground"
                    onClick={() => router.push('/chat/organizations')}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour
                </Button>

                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle>Paiement de l&apos;abonnement</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Organisation: {paymentData.name} • Plan {paymentData.plan}
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <p className="text-sm text-muted-foreground">
                                Montant: <span className="font-semibold text-foreground">{base.toLocaleString('fr-FR')} FCFA</span>
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Total avec frais: <span className="font-semibold">{total.toLocaleString('fr-FR')} FCFA</span>
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Choisir l&apos;opérateur Mobile Money</Label>
                            <div className="flex flex-wrap gap-3">
                                <Button
                                    type="button"
                                    variant={paymentProvider === 'ORANGE_MONEY' ? 'default' : 'outline'}
                                    className={`flex-1 min-w-[140px] gap-2 ${paymentProvider === 'ORANGE_MONEY' ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600' : ''}`}
                                    onClick={() => setPaymentProvider('ORANGE_MONEY')}
                                >
                                    <Smartphone className="w-4 h-4" />
                                    Orange Money
                                </Button>
                                <Button
                                    type="button"
                                    variant={paymentProvider === 'MOOV' ? 'default' : 'outline'}
                                    className={`flex-1 min-w-[140px] gap-2 ${paymentProvider === 'MOOV' ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600' : ''}`}
                                    onClick={() => setPaymentProvider('MOOV')}
                                >
                                    <Smartphone className="w-4 h-4" />
                                    Moov
                                </Button>
                            </div>
                        </div>

                        <Button
                            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={handlePayment}
                            disabled={loading || !paymentProvider}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Redirection...
                                </>
                            ) : (
                                'Procéder au paiement'
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
