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

    // Request geolocation on mount
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
                    toast.error('Géolocalisation refusée. L\'inscription nécessite votre localisation.');
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0,
                }
            );
        } else {
            setGeoPermission('denied');
            toast.error('Votre navigateur ne supporte pas la géolocalisation');
        }
    }, []);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        if (geoPermission !== 'granted') {
            toast.error('Veuillez autoriser la géolocalisation pour continuer');
            return;
        }

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
                    gpsLocation,
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
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">
                    <div className="text-center mb-8">
                        <div className="bg-blue-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-8 h-8 text-blue-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-100 mb-2">Vérification Email</h1>
                        <p className="text-slate-400">
                            Un code à 6 chiffres a été envoyé à<br />
                            <span className="text-blue-400 font-medium">{formData.email}</span>
                        </p>
                    </div>

                    <form onSubmit={handleVerifyOTP} className="space-y-6">
                        <div>
                            <Label htmlFor="otp" className="text-slate-200">Code OTP</Label>
                            <Input
                                id="otp"
                                type="text"
                                maxLength={6}
                                placeholder="123456"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                className="bg-slate-800/50 border-slate-700 text-slate-100 text-center text-2xl tracking-widest"
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700"
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
                            className="w-full text-slate-400 hover:text-slate-200"
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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-100 mb-2">Créer un compte</h1>
                    <p className="text-slate-400">Rejoignez Chat Kephale</p>
                </div>

                {/* Geolocation Status */}
                <div className={`mb-6 p-4 rounded-lg border ${geoPermission === 'granted'
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : geoPermission === 'denied'
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-yellow-500/10 border-yellow-500/30'
                    }`}>
                    <div className="flex items-center gap-3">
                        {geoPermission === 'granted' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : geoPermission === 'denied' ? (
                            <AlertCircle className="w-5 h-5 text-red-400" />
                        ) : (
                            <MapPin className="w-5 h-5 text-yellow-400 animate-pulse" />
                        )}
                        <div className="flex-1">
                            <p className={`text-sm font-medium ${geoPermission === 'granted'
                                ? 'text-emerald-400'
                                : geoPermission === 'denied'
                                    ? 'text-red-400'
                                    : 'text-yellow-400'
                                }`}>
                                {geoPermission === 'granted'
                                    ? 'Géolocalisation activée'
                                    : geoPermission === 'denied'
                                        ? 'Géolocalisation refusée'
                                        : 'Autorisation en cours...'}
                            </p>
                            {geoPermission === 'denied' && (
                                <p className="text-xs text-slate-400 mt-1">
                                    L'inscription nécessite votre localisation pour des raisons de sécurité
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <Label htmlFor="name" className="text-slate-200">Nom complet</Label>
                        <Input
                            id="name"
                            type="text"
                            placeholder="Jean Dupont"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="bg-slate-800/50 border-slate-700 text-slate-100"
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="email" className="text-slate-200">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="jean@example.com"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="bg-slate-800/50 border-slate-700 text-slate-100"
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="phone" className="text-slate-200">Téléphone</Label>
                        <Input
                            id="phone"
                            type="tel"
                            placeholder="+33 6 12 34 56 78"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="bg-slate-800/50 border-slate-700 text-slate-100"
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="password" className="text-slate-200">Mot de passe</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="bg-slate-800/50 border-slate-700 text-slate-100"
                            required
                            minLength={8}
                        />
                    </div>

                    <div>
                        <Label htmlFor="confirmPassword" className="text-slate-200">Confirmer le mot de passe</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            placeholder="••••••••"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            className="bg-slate-800/50 border-slate-700 text-slate-100"
                            required
                            minLength={8}
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        disabled={loading || geoPermission !== 'granted'}
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

                <p className="text-center text-slate-400 mt-6">
                    Déjà un compte ?{' '}
                    <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
                        Se connecter
                    </Link>
                </p>
            </div>
        </div>
    );
}
