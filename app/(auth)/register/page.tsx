'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { MapPin, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
// import { getClientIP, getGeolocationFromIP, isCountryAllowed } from '@/src/lib/geolocation';

export default function RegisterPage() {
    const router = useRouter();
    const [step, setStep] = useState<'form' | 'otp'>('form');
    const [loading, setLoading] = useState(false);
    const [geoPermission, setGeoPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
    const [gpsLocation, setGpsLocation] = useState<{ latitude: number; longitude: number } | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
    });

    const [otpCode, setOtpCode] = useState('');

    // Request geolocation on mount (optional)
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setGpsLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                    setGeoPermission('granted');
                    toast.success('Géolocalisation activée');
                },
                (error) => {
                    setGeoPermission('denied');
                    // Don't show error - geolocation is optional
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0,
                }
            );
        } else {
            setGeoPermission('denied');
        }
    }, []);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        // Geolocation is now optional - no check required

        if (formData.password !== formData.confirmPassword) {
            toast.error('Les mots de passe ne correspondent pas');
            return;
        }

        setLoading(true);
        // IP address will be detected by the server
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    phone: formData.phone,
                    password: formData.password,
                    gpsLocation, // Optional - can be null
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de l\'inscription');
            }

            toast.success(data.message);
            setStep('otp');

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

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

            toast.success(data.message);
            router.push('/login');

        } catch (error: any) {
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

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors du renvoi du code');
            }

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
                <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-2xl">
                    <div className="text-center mb-8">
                        <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground mb-2">Vérification Email</h1>
                        <p className="text-muted-foreground">
                            Un code à 6 chiffres a été envoyé à<br />
                            <span className="text-primary font-medium">{formData.email}</span>
                        </p>
                    </div>

                    <form onSubmit={handleVerifyOTP} className="space-y-6">
                        <div>
                            <Label htmlFor="otp" className="text-foreground">Code OTP</Label>
                            <Input
                                id="otp"
                                type="text"
                                maxLength={6}
                                placeholder="123456"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                className="bg-muted border-border text-foreground text-center text-2xl tracking-widest"
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                            disabled={loading || otpCode.length !== 6}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Vérification...
                                </>
                            ) : (
                                'Vérifier'
                            )}
                        </Button>

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full text-muted-foreground hover:text-foreground"
                            onClick={handleResendOTP}
                            disabled={loading}
                        >
                            Renvoyer le code
                        </Button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-foreground mb-2">Créer un compte</h1>
                    <p className="text-muted-foreground">Rejoignez Chat Kephale</p>
                </div>

                {/* Geolocation Status - Optional */}
                {geoPermission !== 'pending' && (
                    <div className={`mb-6 p-4 rounded-lg border ${geoPermission === 'granted'
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-muted border-border'
                        }`}>
                        <div className="flex items-center gap-3">
                            {geoPermission === 'granted' ? (
                                <CheckCircle2 className="w-5 h-5 text-primary" />
                            ) : (
                                <MapPin className="w-5 h-5 text-muted-foreground" />
                            )}
                            <div className="flex-1">
                                <p className={`text-sm font-medium ${geoPermission === 'granted'
                                    ? 'text-primary'
                                    : 'text-muted-foreground'
                                    }`}>
                                    {geoPermission === 'granted'
                                        ? 'Géolocalisation activée'
                                        : 'Géolocalisation désactivée'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {geoPermission === 'granted'
                                        ? 'Votre localisation sera utilisée pour la sécurité'
                                        : 'Optionnel - Peut être activé plus tard'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <Label htmlFor="name" className="text-foreground">Nom complet</Label>
                        <Input
                            id="name"
                            type="text"
                            placeholder="Jean Dupont"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="bg-muted border-border text-foreground"
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="email" className="text-foreground">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="jean@example.com"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="bg-muted border-border text-foreground"
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="phone" className="text-foreground">Téléphone</Label>
                        <Input
                            id="phone"
                            type="tel"
                            placeholder="+33 6 12 34 56 78"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="bg-muted border-border text-foreground"
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="password" className="text-foreground">Mot de passe</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="bg-muted border-border text-foreground"
                            required
                            minLength={8}
                        />
                    </div>

                    <div>
                        <Label htmlFor="confirmPassword" className="text-foreground">Confirmer le mot de passe</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            placeholder="••••••••"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            className="bg-muted border-border text-foreground"
                            required
                            minLength={8}
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Inscription...
                            </>
                        ) : (
                            'S\'inscrire'
                        )}
                    </Button>
                </form>

                <p className="text-center text-muted-foreground mt-6">
                    Déjà un compte ?{' '}
                    <Link href="/login" className="text-primary hover:text-primary/80 font-medium">
                        Se connecter
                    </Link>
                </p>
            </div>
        </div>
    );
}
