"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { toast } from "sonner";
import { fetchWithAuth } from "@/src/lib/auth-client";
import { Loader2, Check, Upload, Building2, MapPin, CreditCard, Smartphone, FlaskConical } from "lucide-react";

interface OrganizationCompletionWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Si fourni, complète une demande approuvée ; sinon création directe (code auto-généré). */
    requestId?: string;
    onSuccess: () => void;
}

const SUBSCRIPTION_PLANS = [
    {
        id: 'FREE',
        name: 'Gratuit',
        price: '0 FCFA',
        duration: '1 mois (essai unique)',
        features: [
            '2 départements maximum',
            '5 membres par département',
            'Invitations événements illimitées',
            'Support communautaire',
        ],
        recommended: false,
    },
    {
        id: 'BASIC',
        name: 'Basique',
        price: '5 000 FCFA',
        duration: '/ mois',
        features: [
            '5 départements maximum',
            '20 membres par département',
            'Invitations événements illimitées',
            'Support par email',
        ],
        recommended: false,
    },
    {
        id: 'PROFESSIONAL',
        name: 'Professionnel',
        price: '15 000 FCFA',
        duration: '/ mois',
        features: [
            '15 départements maximum',
            '50 membres par département',
            'Invitations événements illimitées',
            'Support prioritaire',
            'Statistiques avancées',
        ],
        recommended: true,
    },
    {
        id: 'ENTERPRISE',
        name: 'Entreprise',
        price: '50 000 FCFA',
        duration: '/ mois',
        features: [
            'Départements illimités',
            'Membres illimités',
            'Invitations événements illimitées',
            'Support dédié 24/7',
            'Statistiques avancées',
            'API personnalisée',
        ],
        recommended: false,
    },
];

const PLAN_PRICES_FCFA: Record<string, number> = {
    FREE: 0,
    BASIC: 5000,
    PROFESSIONAL: 15000,
    ENTERPRISE: 50000,
};

export default function OrganizationCompletionWizard({
    open,
    onOpenChange,
    requestId,
    onSuccess,
}: OrganizationCompletionWizardProps) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form data
    const [name, setName] = useState("");
    const [logo, setLogo] = useState("");
    const [address, setAddress] = useState("");
    const [selectedPlan, setSelectedPlan] = useState<string>("FREE");
    const [paymentProvider, setPaymentProvider] = useState<'ORANGE_MONEY' | 'MOOV' | ''>('');
    const [phone, setPhone] = useState('');

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogo(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const isDirectCreate = !requestId;

    const handleSubmit = async () => {
        const trimmedName = name?.trim() ?? '';
        if (!trimmedName || trimmedName.length < 2) {
            toast.error("Le nom de l'organisation est requis (au moins 2 caractères)");
            return;
        }

        setLoading(true);

        try {
            // 1) Si plan payant : enregistrement en attente + CinetPay, puis redirection
            if (selectedPlan !== 'FREE') {
                const payRes = await fetchWithAuth('/api/payments/paytech/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        plan: selectedPlan,
                        name: trimmedName,
                        logo: logo || undefined,
                        address: address?.trim() || undefined,
                        requestId: requestId || undefined,
                        customer_name: trimmedName,
                        customer_phone_number: phone.trim() || undefined,
                    }),
                });

                const payData = await payRes.json();

                if (!payRes.ok || payData.status !== 'success') {
                    toast.error(
                        payData.error ||
                        'Le paiement de l’abonnement a échoué. Veuillez réessayer.',
                    );
                    setLoading(false);
                    return;
                }
                if (payData.paymentUrl) {
                    toast.success('Redirection vers la page de paiement CinetPay...');
                    window.location.href = payData.paymentUrl;
                    return;
                }
            }

            // 2) Création / complétion de l'organisation avec le plan choisi
            const url = isDirectCreate ? '/api/organizations/create' : '/api/organizations/complete';
            const body = isDirectCreate
                ? { name: trimmedName, logo, address, plan: selectedPlan }
                : { requestId, name: trimmedName, logo, address, plan: selectedPlan };

            const res = await fetchWithAuth(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Erreur lors de la création de l\'organisation');
                return;
            }

            toast.success(data.code
                ? `Organisation créée avec succès ! Code d'accès: ${data.code}`
                : 'Organisation créée avec succès !');

            // Reset form
            setStep(1);
            setName("");
            setLogo("");
            setAddress("");
            setSelectedPlan("FREE");
            setPaymentProvider('');
            setPhone('');

            onSuccess();

        } catch (error) {
            console.error('Error completing organization:', error);
            toast.error('Erreur lors de la création de l\'organisation');
        } finally {
            setLoading(false);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="orgName">Nom de l'Organisation *</Label>
                            <Input
                                id="orgName"
                                type="text"
                                placeholder="Mon Entreprise"
                                className="bg-muted border-border text-foreground"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="orgLogo">Logo (optionnel)</Label>
                            <div className="flex items-center gap-4">
                                {logo && (
                                    <img
                                        src={logo}
                                        alt="Logo preview"
                                        className="w-16 h-16 rounded-full object-cover border-2 border-border"
                                    />
                                )}
                                <div className="flex-1">
                                    <Input
                                        id="orgLogo"
                                        type="file"
                                        accept="image/*"
                                        className="bg-muted border-border text-foreground"
                                        onChange={handleLogoUpload}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="orgAddress">Adresse (optionnel)</Label>
                            <Textarea
                                id="orgAddress"
                                placeholder="123 Rue Example, Ville, Pays"
                                className="bg-muted border-border text-foreground"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>
                );

            case 2:
                return (
                    <div className="flex flex-col min-h-[420px]">
                        <p className="text-sm text-muted-foreground mb-4">
                            Choisissez le plan d&apos;abonnement qui correspond le mieux à vos besoins
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[320px] overflow-y-auto pr-2">
                            {SUBSCRIPTION_PLANS.map((plan) => (
                                <div
                                    key={plan.id}
                                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition ${selectedPlan === plan.id
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border bg-muted/50 hover:border-muted-foreground'
                                        }`}
                                    onClick={() => setSelectedPlan(plan.id)}
                                >
                                    {plan.recommended && (
                                        <div className="absolute -top-2 -right-2 bg-foreground text-background text-xs px-2 py-1 rounded-full">
                                            Recommandé
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-lg text-foreground">{plan.name}</h3>
                                        {selectedPlan === plan.id && (
                                            <Check className="w-5 h-5 text-primary" />
                                        )}
                                    </div>

                                    <div className="mb-4">
                                        <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                                        <span className="text-muted-foreground text-sm">{plan.duration}</span>
                                    </div>

                                    <ul className="space-y-2">
                                        {plan.features.map((feature, idx) => (
                                            <li key={idx} className="flex items-start gap-2 text-sm">
                                                <Check className="w-4 h-4 text-foreground mt-0.5 flex-shrink-0" />
                                                <span className="text-muted-foreground">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>

                        {/* Section paiement : centrée au milieu, opérateur uniquement, mode dev */}
                        {selectedPlan !== 'FREE' && (
                            <div className="flex-1 flex items-center justify-center py-6">
                                <div className="space-y-3 border border-border rounded-lg p-4 bg-muted/30 max-w-md w-full mx-auto relative">
                                    <div className="absolute -top-2 right-3 flex items-center gap-1.5 bg-warning/20 text-warning text-xs font-medium px-2 py-1 rounded-full border border-amber-500/30">
                                        <FlaskConical className="w-3.5 h-3.5" />
                                        Mode développement
                                    </div>
                                    {(() => {
                                        const base = PLAN_PRICES_FCFA[selectedPlan] ?? 0;
                                        const feeRate = 0.02;
                                        const total = Math.round(base * (1 + feeRate));

                                        return (
                                            <>
                                                <div className="text-center space-y-1">
                                                    <p className="text-sm font-medium text-foreground">
                                                        Détails du paiement
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Montant :{' '}
                                                        <span className="font-semibold text-foreground">
                                                            {base.toLocaleString('fr-FR')} FCFA
                                                        </span>
                                                        {' '}(total avec frais :{' '}
                                                        <span className="font-semibold text-foreground">
                                                            {total.toLocaleString('fr-FR')} FCFA
                                                        </span>
                                                        )
                                                    </p>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label className="text-center block">Choisir l&apos;opérateur Mobile Money</Label>
                                                    <div className="flex flex-wrap gap-3 justify-center">
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
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                );

            default:
                return null;
        }
    };

    const getStepIcon = (stepNumber: number) => {
        switch (stepNumber) {
            case 1:
                return <Building2 className="w-5 h-5" />;
            case 2:
                return <CreditCard className="w-5 h-5" />;
            default:
                return null;
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border text-foreground max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Compléter votre Organisation</DialogTitle>
                </DialogHeader>

                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-4 py-4">
                    {[1, 2].map((stepNumber) => (
                        <div key={stepNumber} className="flex items-center gap-2">
                            <div
                                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${step === stepNumber
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : step > stepNumber
                                        ? 'bg-foreground text-background border-foreground'
                                        : 'bg-muted text-muted-foreground border-border'
                                    }`}
                            >
                                {step > stepNumber ? (
                                    <Check className="w-5 h-5" />
                                ) : (
                                    getStepIcon(stepNumber)
                                )}
                            </div>
                            {stepNumber < 2 && (
                                <div
                                    className={`w-16 h-1 ${step > stepNumber ? 'bg-foreground' : 'bg-border'
                                        }`}
                                />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                <div className="py-4">
                    {renderStep()}
                </div>

                {/* Navigation Buttons */}
                <div className="flex gap-3">
                    {step > 1 && (
                        <Button
                            variant="outline"
                            className="flex-1 border-border hover:bg-muted"
                            onClick={() => setStep(step - 1)}
                            disabled={loading}
                        >
                            Précédent
                        </Button>
                    )}

                    {step < 2 ? (
                        <Button
                            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={() => setStep(step + 1)}
                            disabled={!name}
                        >
                            Suivant
                        </Button>
                    ) : (
                        <Button
                            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={handleSubmit}
                            disabled={loading || !name}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                'Créer l\'Organisation'
                            )}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
