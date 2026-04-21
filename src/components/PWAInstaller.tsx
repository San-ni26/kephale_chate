'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Share, X, Smartphone } from 'lucide-react';
import { Button } from '@/src/components/ui/button';

/**
 * PWAInstaller : bouton d'installation PWA + aide iOS
 * Support Android/Chrome/Edge (bouton natif) + iOS Safari (instructions)
 */

const IOS_HELPER_DISMISSED_KEY = 'pwa-ios-helper-dismissed';

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstaller() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showInstallButton, setShowInstallButton] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [iosHelperDismissed, setIosHelperDismissed] = useState(false);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Vérifier si déjà installée (mode standalone)
        const standalone = window.matchMedia('(display-mode: standalone)').matches 
            || (window.navigator as unknown as { standalone: boolean }).standalone === true;
        
        // Détecter iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream: unknown }).MSStream;
        
        // Vérifier si l'aide iOS a été dismiss
        const dismissed = localStorage.getItem(IOS_HELPER_DISMISSED_KEY) === 'true';
        
        // Batch state updates in a microtask to avoid cascading renders
        Promise.resolve().then(() => {
            setIsStandalone(standalone);
            setIsIOS(isIOSDevice);
            setIosHelperDismissed(dismissed);
            setIsReady(true);
        });

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
            setDeferredPrompt(e as BeforeInstallPromptEvent);
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
    };

    const dismissInstallButton = () => {
        setShowInstallButton(false);
    };

    // Si déjà installée ou pas encore prêt, ne rien afficher
    if (!isReady || isStandalone) return null;

    // iOS non installé → afficher l'aide spécifique iOS
    if (isIOS && !iosHelperDismissed) {
        return (
            <div className="fixed bottom-20 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-300">
                <div className="bg-primary text-primary-foreground rounded-xl border border-primary/30 shadow-lg p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                            <Share className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm">Installer sur iPhone</h3>
                            <p className="text-xs text-primary-foreground/80 mt-1 leading-relaxed">
                                Appuyez sur <Share className="inline w-3 h-3 mx-0.5" /> en bas de Safari,
                                puis sélectionnez <strong>&quot;Sur l&apos;écran d&apos;accueil&quot;</strong>
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={dismissIOSHelper}
                            className="h-8 w-8 shrink-0 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/20"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="mt-3 flex justify-end">
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={dismissIOSHelper}
                            className="bg-white/20 text-primary-foreground hover:bg-white/30"
                        >
                            J&apos;ai compris
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Android/Chrome/Edge avec prompt disponible → bouton installer
    if (showInstallButton && deferredPrompt) {
        return (
            <div className="fixed bottom-20 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-300">
                <div className="bg-primary text-primary-foreground rounded-xl border border-primary/30 shadow-lg p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                            <Smartphone className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm">Installer l&apos;application</h3>
                            <p className="text-xs text-primary-foreground/80 mt-1">
                                Ajoutez Chat Kephale sur votre écran d&apos;accueil pour un accès rapide
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={dismissInstallButton}
                            className="h-8 w-8 shrink-0 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/20"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="mt-3 flex gap-2 justify-end">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={dismissInstallButton}
                            className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/20"
                        >
                            Plus tard
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleInstall}
                            className="bg-white/20 text-primary-foreground hover:bg-white/30"
                        >
                            <Download className="w-4 h-4 mr-1.5" />
                            Installer
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Sinon → rien
    return null;
}
