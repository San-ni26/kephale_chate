'use client';

import { WifiOff, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function OfflinePage() {
    const router = useRouter();
    const [isRetrying, setIsRetrying] = useState(false);

    const handleRetry = async () => {
        setIsRetrying(true);
        // Fake delay for UX to show we are trying
        await new Promise(r => setTimeout(r, 1000));

        if (typeof navigator !== 'undefined' && navigator.onLine) {
            window.location.reload();
        } else {
            setIsRetrying(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Ambient Background Elements */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/20 rounded-full blur-3xl -z-10" />

            <div className="max-w-md w-full text-center relative z-10">
                <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-3xl p-8 shadow-2xl ring-1 ring-white/10">

                    {/* Icon Container */}
                    <div className="relative mx-auto mb-8 w-24 h-24 flex items-center justify-center">
                        <div className="absolute inset-0 bg-destructive/20 rounded-full animate-ping opacity-75" />
                        <div className="relative bg-gradient-to-b from-muted to-background rounded-full w-24 h-24 flex items-center justify-center border border-border shadow-inner">
                            <WifiOff className="w-10 h-10 text-destructive drop-shadow-md" />
                        </div>
                    </div>

                    <h1 className="text-3xl font-extrabold text-foreground mb-3 tracking-tight">
                        Connexion Perdue
                    </h1>

                    <p className="text-muted-foreground mb-8 text-lg leading-relaxed">
                        Oups ! Il semble que vous soyez hors ligne. Vérifiez votre signal et réessayez.
                    </p>

                    <div className="space-y-4">
                        <Button
                            onClick={handleRetry}
                            disabled={isRetrying}
                            size="lg"
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl h-12 shadow-lg hover:shadow-primary/25 transition-all duration-300"
                        >
                            <RefreshCw className={`w-5 h-5 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
                            {isRetrying ? 'Connexion...' : 'Réessayer'}
                        </Button>

                        <Button
                            onClick={() => router.push('/chat')}
                            variant="ghost"
                            size="lg"
                            className="w-full text-foreground/70 hover:text-foreground hover:bg-muted/50 rounded-xl"
                        >
                            <Home className="w-5 h-5 mr-2" />
                            Retour à l'accueil
                        </Button>
                    </div>

                    <div className="mt-8 pt-6 border-t border-border/40">
                        <p className="text-xs text-muted-foreground font-medium flex items-center justify-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500/50 inline-block animate-pulse" />
                            Mode hors ligne activé
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
