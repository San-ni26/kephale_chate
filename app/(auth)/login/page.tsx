'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Lock, Loader2, AlertCircle, ArrowLeft, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { setAuth } from '@/src/lib/auth-client';
import { Alert } from '@/src/components/ui/custom-alert';

type Step = 'login' | 'forgot-email' | 'forgot-otp';

export default function LoginPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('login');
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        otpCode: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [forgotEmail, setForgotEmail] = useState('');
    const [alertStatus, setAlertStatus] = useState<{
        type: 'success' | 'error';
        message: string;
        title?: string;
    } | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setAlertStatus(null);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.deviceMismatch) {
                    toast.error(data.error, {
                        description: data.hint,
                        duration: 6000,
                    });
                } else {
                    toast.error(data.error);
                }
                setAlertStatus({
                    type: 'error',
                    message: data.error,
                    title: 'Erreur de connexion',
                });
                return;
            }

            setAuth(data.token, data.user);
            toast.success(data.message);
            router.push('/chat');
        } catch (error: any) {
            const msg = error.message || 'Erreur lors de la connexion';
            toast.error(msg);
            setAlertStatus({ type: 'error', message: msg, title: 'Erreur' });
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPasswordRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setAlertStatus(null);

        try {
            const email = step === 'forgot-email' ? formData.email : forgotEmail;
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                toast.error(data.error || 'Une erreur est survenue');
                setAlertStatus({
                    type: 'error',
                    message: data.error || 'Une erreur est survenue',
                    title: 'Erreur',
                });
                return;
            }

            setForgotEmail(email);
            setStep('forgot-otp');
            toast.success('Code envoyé ! Vérifiez votre email.');
            setAlertStatus({
                type: 'success',
                message: 'Un code a été envoyé à votre adresse email. Entrez-le ci-dessous.',
                title: 'Email envoyé',
            });
        } catch (error: any) {
            const msg = error.message || 'Erreur lors de l\'envoi du code';
            toast.error(msg);
            setAlertStatus({ type: 'error', message: msg, title: 'Erreur' });
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setAlertStatus(null);

        if (formData.newPassword !== formData.confirmPassword) {
            setAlertStatus({
                type: 'error',
                message: 'Les mots de passe ne correspondent pas',
                title: 'Validation',
            });
            toast.error('Les mots de passe ne correspondent pas');
            setLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: forgotEmail,
                    otpCode: formData.otpCode,
                    newPassword: formData.newPassword,
                    confirmPassword: formData.confirmPassword,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                toast.error(data.error || 'Une erreur est survenue');
                setAlertStatus({
                    type: 'error',
                    message: data.error || 'Une erreur est survenue',
                    title: 'Erreur',
                });
                return;
            }

            toast.success(data.message);
            setAlertStatus({
                type: 'success',
                message: 'Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter.',
                title: 'Mot de passe réinitialisé',
            });

            setTimeout(() => {
                setStep('login');
                setFormData({
                    ...formData,
                    otpCode: '',
                    newPassword: '',
                    confirmPassword: '',
                });
                setAlertStatus(null);
            }, 2500);
        } catch (error: any) {
            const msg = error.message || 'Erreur lors de la réinitialisation';
            toast.error(msg);
            setAlertStatus({ type: 'error', message: msg, title: 'Erreur' });
        } finally {
            setLoading(false);
        }
    };

    const handleResendOTP = async () => {
        setLoading(true);
        setAlertStatus(null);

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail }),
            });

            const data = await response.json();

            if (!response.ok) {
                toast.error(data.error || 'Erreur lors de l\'envoi');
                setAlertStatus({
                    type: 'error',
                    message: data.error || 'Erreur lors de l\'envoi',
                    title: 'Erreur',
                });
                return;
            }

            toast.success('Nouveau code envoyé !');
            setAlertStatus({
                type: 'success',
                message: 'Un nouveau code a été envoyé à votre email.',
                title: 'Code renvoyé',
            });
        } catch (error: any) {
            toast.error('Erreur lors de l\'envoi du code');
        } finally {
            setLoading(false);
        }
    };

    const goToForgotEmail = () => {
        setStep('forgot-email');
        setFormData({ ...formData, email: formData.email || '' });
        setForgotEmail('');
        setAlertStatus(null);
    };

    const backToLogin = () => {
        setStep('login');
        setAlertStatus(null);
    };

    // Étape : Mot de passe oublié - saisie email
    if (step === 'forgot-email') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-2xl">
                    <div className="text-center mb-8">
                        <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Mail className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-3xl font-bold text-foreground mb-2">Mot de passe oublié</h1>
                        <p className="text-muted-foreground">
                            Entrez votre email pour recevoir un code de réinitialisation
                        </p>
                    </div>

                    {alertStatus && (
                        <Alert
                            type={alertStatus.type}
                            title={alertStatus.title}
                            message={alertStatus.message}
                            className="mb-6 animate-in slide-in-from-top-2"
                        />
                    )}

                    <form onSubmit={handleForgotPasswordRequest} className="space-y-4">
                        <div>
                            <Label htmlFor="forgot-email" className="text-foreground">Email</Label>
                            <Input
                                id="forgot-email"
                                type="email"
                                placeholder="jean@example.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="bg-muted border-border text-foreground"
                                required
                                autoFocus
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
                                    Envoi en cours...
                                </>
                            ) : (
                                'Envoyer le code'
                            )}
                        </Button>

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={backToLogin}
                            disabled={loading}
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Retour à la connexion
                        </Button>
                    </form>
                </div>
            </div>
        );
    }

    // Étape : Mot de passe oublié - saisie OTP et nouveau mot de passe
    if (step === 'forgot-otp') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-2xl">
                    <div className="text-center mb-8">
                        <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Lock className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground mb-2">Nouveau mot de passe</h1>
                        <p className="text-muted-foreground">
                            Code envoyé à <span className="text-primary font-medium">{forgotEmail}</span>
                        </p>
                    </div>

                    {alertStatus && (
                        <Alert
                            type={alertStatus.type}
                            title={alertStatus.title}
                            message={alertStatus.message}
                            className="mb-6 animate-in slide-in-from-top-2"
                        />
                    )}

                    <form onSubmit={handleResetPassword} className="space-y-4">
                        <div>
                            <Label htmlFor="otp" className="text-foreground">Code OTP</Label>
                            <Input
                                id="otp"
                                type="text"
                                maxLength={6}
                                placeholder="123456"
                                value={formData.otpCode}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        otpCode: e.target.value.replace(/\D/g, ''),
                                    })
                                }
                                className="bg-muted border-border text-foreground text-center text-2xl tracking-[0.5em] font-mono"
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <Label htmlFor="new-password" className="text-foreground">Nouveau mot de passe</Label>
                            <Input
                                id="new-password"
                                type="password"
                                placeholder="••••••••"
                                value={formData.newPassword}
                                onChange={(e) =>
                                    setFormData({ ...formData, newPassword: e.target.value })
                                }
                                className="bg-muted border-border text-foreground"
                                required
                                minLength={8}
                            />
                        </div>

                        <div>
                            <Label htmlFor="confirm-password" className="text-foreground">
                                Confirmer le mot de passe
                            </Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                placeholder="••••••••"
                                value={formData.confirmPassword}
                                onChange={(e) =>
                                    setFormData({ ...formData, confirmPassword: e.target.value })
                                }
                                className="bg-muted border-border text-foreground"
                                required
                                minLength={8}
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                            disabled={loading || formData.otpCode.length !== 6}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Réinitialisation...
                                </>
                            ) : (
                                'Réinitialiser le mot de passe'
                            )}
                        </Button>

                        <div className="text-center">
                            <button
                                type="button"
                                className="text-sm text-muted-foreground hover:text-primary transition-colors hover:underline"
                                onClick={handleResendOTP}
                                disabled={loading}
                            >
                                Je n&apos;ai pas reçu le code
                            </button>
                        </div>

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={backToLogin}
                            disabled={loading}
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Retour à la connexion
                        </Button>
                    </form>
                </div>
            </div>
        );
    }

    // Étape par défaut : formulaire de connexion
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-3xl font-bold text-foreground mb-2">Connexion</h1>
                    <p className="text-muted-foreground">Accédez à votre compte sécurisé</p>
                </div>

                <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-primary">Sécurité renforcée</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Votre compte est lié à votre appareil. Toute connexion depuis un nouvel appareil sera bloquée.
                            </p>
                        </div>
                    </div>
                </div>

                {alertStatus && (
                    <Alert
                        type={alertStatus.type}
                        title={alertStatus.title}
                        message={alertStatus.message}
                        className="mb-6 animate-in slide-in-from-top-2"
                    />
                )}

                <form onSubmit={handleLogin} className="space-y-4">
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
                        <div className="flex justify-between items-center mb-1">
                            <Label htmlFor="password" className="text-foreground">Mot de passe</Label>
                            <button
                                type="button"
                                onClick={goToForgotEmail}
                                className="text-xs text-primary hover:text-primary/80 hover:underline"
                            >
                                Mot de passe oublié ?
                            </button>
                        </div>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="bg-muted border-border text-foreground"
                            required
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
                                Connexion...
                            </>
                        ) : (
                            'Se connecter'
                        )}
                    </Button>
                </form>

                <p className="text-center text-muted-foreground mt-6">
                    Pas encore de compte ?{' '}
                    <Link href="/register" className="text-primary hover:text-primary/80 font-medium">
                        S&apos;inscrire
                    </Link>
                </p>

                <div className="mt-6 pt-6 border-t border-border">
                    <p className="text-xs text-muted-foreground text-center">
                        En vous connectant, vous acceptez nos conditions d&apos;utilisation et notre politique de confidentialité.
                    </p>
                </div>
            </div>
        </div>
    );
}
