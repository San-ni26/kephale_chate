'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Share, X, Smartphone, Plus } from 'lucide-react';

/**
 * PWAInstaller : prompt d'installation + écoute des mises à jour du SW.
 * Support complet iOS (qui n'a pas beforeinstallprompt).
 * L'enregistrement du SW est géré par ServiceWorkerRegistration (évite doublon).
 */

const IOS_HELPER_DISMISSED_KEY = 'pwa-ios-helper-dismissed';

export function PWAInstaller() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showInstallButton, setShowInstallButton] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [showIOSHelp, setShowIOSHelp] = useState(false);
    const [iosHelperDismissed, setIosHelperDismissed] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Vérifier si déjà installée (mode standalone)
        const standalone = window.matchMedia('(display-mode: standalone)').matches 
            || (window.navigator as any).standalone === true;
        setIsStandalone(standalone);

        // Détecter iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);

        // Vérifier si l'aide iOS a été dismiss
        const dismissed = localStorage.getItem(IOS_HELPER_DISMISSED_KEY) === 'true';
        setIosHelperDismissed(dismissed);

        if (!('serviceWorker' in navigator)) return;

        // Écouter les mises à jour du SW (enregistré par ServiceWorkerRegistration)
        const setupUpdateListener = async () => {
            try {
                const registration = await navigator.serviceWorker.getRegistration('/');
                if (!registration) return;

                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                toast.info('Mise à jour disponible', {
                                    action: {
                                        label: 'Recharger',
                                        onClick: () => window.location.reload(),
                                    },
                                    duration: 10000,
                                });
                            }
                        });
                    }
                });
            } catch {
                // Ignorer
            }
        };

        if (document.readyState === 'complete') {
            setupUpdateListener();
        } else {
            window.addEventListener('load', setupUpdateListener, { once: true });
        }

        // PWA install prompt (Android/Chrome/Edge)
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallButton(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', () => {
            setShowInstallButton(false);
            setDeferredPrompt(null);
            toast.success('Application installée !');
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            toast.success('Installation en cours...');
        }
        setDeferredPrompt(null);
        setShowInstallButton(false);
    };

    const dismissIOSHelper = () => {
        localStorage.setItem(IOS_HELPER_DISMISSED_KEY, 'true');
        setIosHelperDismissed(true);
        setShowIOSHelp(false);
    };

    // Si déjà installée, ne rien afficher
    if (isStandalone) return null;

    return (
        <>
            {/* Bouton d'installation Android/Desktop */}
            {showInstallButton && deferredPrompt && (
                <button
                    onClick={handleInstall}
                    className="fixed bottom-20 right-4 md:bottom-4 bg-primary text-primary-foreground px-4 py-3 rounded-lg shadow-lg hover:bg-primary/90 transition-colors z-50 flex items-center gap-2 animate-in slide-in-from-bottom-5"
                >
                    <Download className="w-4 h-4" />
                    <span className="font-medium">Installer l'app</span>
                </button>
            )}

            {/* Bouton aide iOS */}
            {isIOS && !showInstallButton && !iosHelperDismissed && (
                <button
                    onClick={() => setShowIOSHelp(true)}
                    className="fixed bottom-20 right-4 md:bottom-4 bg-primary text-primary-foreground px-4 py-3 rounded-lg shadow-lg hover:bg-primary/90 transition-colors z-50 flex items-center gap-2 animate-in slide-in-from-bottom-5"
                >
                    <Smartphone className="w-4 h-4" />
                    <span className="font-medium">Installer sur iPhone</span>
                </button>
            )}

            {/* Modal aide iOS */}
            {showIOSHelp && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-4"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowIOSHelp(false);
                    }}
                >
                    <div className="bg-background rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in slide-in-from-bottom-10">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold">Installer sur iPhone/iPad</h3>
                            <button 
                                onClick={() => setShowIOSHelp(false)}
                                className="p-1 hover:bg-muted rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Instructions */}
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold">
                                    1
                                </div>
                                <div>
                                    <p className="font-medium">Appuyez sur le bouton Partager</p>
                                    <p className="text-sm text-muted-foreground">
                                        L'icône <Share className="w-4 h-4 inline mx-1" /> en bas de Safari
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold">
                                    2
                                </div>
                                <div>
                                    <p className="font-medium">Faites défiler et sélectionnez</p>
                                    <p className="text-sm text-muted-foreground">
                                        "Sur l'écran d'accueil" <Plus className="w-4 h-4 inline mx-1" />
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold">
                                    3
                                </div>
                                <div>
                                    <p className="font-medium">Confirmez avec "Ajouter"</p>
                                    <p className="text-sm text-muted-foreground">
                                        L'app s'installera comme une application native
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="mt-6 pt-4 border-t flex gap-2">
                            <button
                                onClick={() => setShowIOSHelp(false)}
                                className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                            >
                                J'ai compris
                            </button>
                        </div>
                        <button
                            onClick={dismissIOSHelper}
                            className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Ne plus afficher
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
