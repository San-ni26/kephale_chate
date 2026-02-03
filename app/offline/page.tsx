'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { useRouter } from 'next/navigation';

export default function OfflinePage() {
    const router = useRouter();

    const handleRetry = () => {
        if (navigator.onLine) {
            router.refresh();
        } else {
            alert('Vous êtes toujours hors ligne. Veuillez vérifier votre connexion internet.');
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center">
                <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
                    <div className="bg-muted w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <WifiOff className="w-10 h-10 text-muted-foreground" />
                    </div>

                    <h1 className="text-2xl font-bold text-foreground mb-3">
                        Vous êtes hors ligne
                    </h1>

                    <p className="text-muted-foreground mb-6">
                        Impossible de se connecter au serveur. Vérifiez votre connexion internet et réessayez.
                    </p>

                    <div className="space-y-3">
                        <Button
                            onClick={handleRetry}
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Réessayer
                        </Button>

                        <Button
                            onClick={() => router.push('/chat')}
                            variant="outline"
                            className="w-full"
                        >
                            Retour à l'accueil
                        </Button>
                    </div>

                    <div className="mt-8 pt-6 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                            Certaines fonctionnalités peuvent être disponibles hors ligne grâce au cache de l'application.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
