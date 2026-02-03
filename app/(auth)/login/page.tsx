'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { setAuth } from '@/src/lib/auth-client';

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
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
                return;
            }

            // Store token and user data using auth utilities
            setAuth(data.token, data.user);

            toast.success(data.message);
            router.push('/chat');

        } catch (error: any) {
            toast.error(error.message || 'Erreur lors de la connexion');
        } finally {
            setLoading(false);
        }
    };

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
                        <Label htmlFor="password" className="text-foreground">Mot de passe</Label>
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
                        S'inscrire
                    </Link>
                </p>

                <div className="mt-6 pt-6 border-t border-border">
                    <p className="text-xs text-muted-foreground text-center">
                        En vous connectant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
                    </p>
                </div>
            </div>
        </div>
    );
}
