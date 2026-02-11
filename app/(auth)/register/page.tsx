'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Loader2, CheckCircle2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { PhoneInput } from '@/src/components/ui/phone-input';
import { Alert } from '@/src/components/ui/custom-alert';
import { cn } from '@/src/lib/utils';

export default function RegisterPage() {
    const router = useRouter();
    const [step, setStep] = useState<'form' | 'otp'>('form');
    const [loading, setLoading] = useState(false);
    const [geoStatus, setGeoStatus] = useState<'pending' | 'granted' | 'denied' | 'error'>('pending');
    const [gpsLocation, setGpsLocation] = useState<{ latitude: number; longitude: number } | null>(null);

    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string, title?: string } | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
    });

    const [otpCode, setOtpCode] = useState('');

    // Request geolocation on mount
    useEffect(() => {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setGpsLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                    setGeoStatus('granted');
                },
                (error) => {
                    console.warn("Geolocation denied or failed", error);
                    setGeoStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            setGeoStatus('denied');
        }
    }, []);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus(null);

        if (formData.password !== formData.confirmPassword) {
            setStatus({ type: 'error', message: 'Les mots de passe ne correspondent pas', title: 'Erreur de validation' });
            return;
        }

        if (!formData.phone || formData.phone.length < 8) {
            setStatus({ type: 'error', message: 'Veuillez entrer un numéro de téléphone valide via le sélecteur.', title: 'Téléphone invalide' });
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    phone: formData.phone,
                    password: formData.password,
                    gpsLocation,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 403 && data.countryCode) {
                    throw new Error(`Inscription non autorisée depuis votre pays (${data.countryCode})`);
                }
                throw new Error(data.error || 'Erreur lors de l\'inscription');
            }

            setStatus({ type: 'success', message: data.message, title: 'Inscription réussie' });
            toast.success(data.message);

            // Wait a bit to show success alert before switching steps
            setTimeout(() => setStep('otp'), 1500);

        } catch (error: any) {
            setStatus({ type: 'error', message: error.message, title: 'Erreur' });
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatus(null);

        try {
            const response = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    otpCode,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de la vérification');
            }

            setStatus({ type: 'success', message: 'Email vérifié avec succès. Redirection...', title: 'Succès' });
            toast.success(data.message);

            setTimeout(() => router.push('/login'), 1500);

        } catch (error: any) {
            setStatus({ type: 'error', message: error.message, title: 'Échec de vérification' });
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResendOTP = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/auth/resend-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email }),
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error);

            setStatus({ type: 'success', message: 'Nouveau code envoyé !', title: 'Envoyé' });
            toast.success(data.message);
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    if (step === 'otp') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="text-center mb-8">
                        <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-primary/5">
                            <CheckCircle2 className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground mb-2">Vérification Email</h1>
                        <p className="text-muted-foreground">
                            Entrez le code envoyé à <span className="text-primary font-medium">{formData.email}</span>
                        </p>
                    </div>

                    {status && (
                        <Alert
                            type={status.type as any}
                            title={status.title}
                            message={status.message}
                            className="mb-6 animate-in slide-in-from-top-2"
                        />
                    )}

                    <form onSubmit={handleVerifyOTP} className="space-y-6">
                        <div>
                            <Input
                                type="text"
                                maxLength={6}
                                placeholder="123456"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                className="bg-muted/50 border-input text-foreground text-center text-3xl tracking-[1em] h-16 font-mono"
                                required
                                autoFocus
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11 text-base"
                            disabled={loading || otpCode.length !== 6}
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Vérifier'}
                        </Button>

                        <div className="text-center">
                            <button
                                type="button"
                                className="text-sm text-muted-foreground hover:text-primary transition-colors hover:underline"
                                onClick={handleResendOTP}
                                disabled={loading}
                            >
                                Je n'ai pas reçu le code
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-foreground mb-2">Créer un compte</h1>
                    <p className="text-muted-foreground">Rejoignez la communauté sécurisée</p>
                </div>

                {status && (
                    <Alert
                        type={status.type as any}
                        title={status.title}
                        message={status.message}
                        className="mb-6 animate-in slide-in-from-top-2"
                    />
                )}

                {/* Geolocation Notice */}
                <div className={cn(
                    "mb-6 p-4 rounded-xl border flex items-start gap-3 transition-colors",
                    geoStatus === 'granted' ? "bg-success/10 border-success/20" : "bg-muted/50 border-border"
                )}>
                    <MapPin className={cn(
                        "w-5 h-5 mt-0.5 shrink-0",
                        geoStatus === 'granted' ? "text-success" : "text-muted-foreground"
                    )} />
                    <div className="text-sm">
                        <p className={cn("font-medium", geoStatus === 'granted' ? "text-success" : "text-foreground")}>
                            {geoStatus === 'granted' ? 'Localisation activée' : 'Localisation désactivée'}
                        </p>
                        <p className="text-muted-foreground text-xs mt-1">
                            {geoStatus === 'granted'
                                ? 'Votre position a été vérifiée pour sécuriser votre inscription.'
                                : 'Activez la localisation pour une meilleure sécurité (optionnel).'}
                        </p>
                    </div>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <Label htmlFor="name" className="mb-1.5 block">Nom complet</Label>
                            <Input
                                id="name"
                                placeholder="Jean Dupont"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="bg-muted/30"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="email" className="mb-1.5 block">Email professionnel</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="jean@entreprise.com"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="bg-muted/30"
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="phone" className="mb-1.5 block">Téléphone</Label>
                        <PhoneInput
                            value={formData.phone}
                            onChange={(val) => setFormData({ ...formData, phone: val })}
                            className="w-full"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1 text-right">Format international automatique</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 sm:col-span-1">
                            <Label htmlFor="password" className="mb-1.5 block">Mot de passe</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="bg-muted/30"
                                required
                                minLength={8}
                            />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <Label htmlFor="confirmPassword" className="mb-1.5 block">Confirmation</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="••••••••"
                                value={formData.confirmPassword}
                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                className="bg-muted/30"
                                required
                                minLength={8}
                            />
                        </div>
                    </div>

                    <Button
                        type="submit"
                        className="w-full mt-2 h-11 text-base font-semibold shadow-lg shadow-primary/20"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Inscription en cours...
                            </>
                        ) : (
                            'Créer mon compte'
                        )}
                    </Button>
                </form>

                <p className="text-center text-muted-foreground mt-8 text-sm">
                    Déjà inscrit ?{' '}
                    <Link href="/login" className="text-primary hover:text-primary/80 font-medium hover:underline underline-offset-4">
                        Connexion
                    </Link>
                </p>
            </div>
        </div>
    );
}
