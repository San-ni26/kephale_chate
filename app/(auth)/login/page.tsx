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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="bg-blue-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-8 h-8 text-blue-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-100 mb-2">Connexion</h1>
                    <p className="text-slate-400">Accédez à votre compte sécurisé</p>
                </div>

                <div className="mb-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-blue-400">Sécurité renforcée</p>
                            <p className="text-xs text-slate-400 mt-1">
                                Votre compte est lié à votre appareil. Toute connexion depuis un nouvel appareil sera bloquée.
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
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
                        <Label htmlFor="password" className="text-slate-200">Mot de passe</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="bg-slate-800/50 border-slate-700 text-slate-100"
                            required
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700"
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

                <p className="text-center text-slate-400 mt-6">
                    Pas encore de compte ?{' '}
                    <Link href="/register" className="text-blue-400 hover:text-blue-300 font-medium">
                        S'inscrire
                    </Link>
                </p>

                <div className="mt-6 pt-6 border-t border-slate-800">
                    <p className="text-xs text-slate-500 text-center">
                        En vous connectant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
                    </p>
                </div>
            </div>
        </div>
    );
}
