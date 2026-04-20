'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * PWAInstaller : écoute des mises à jour du SW uniquement.
 * Les boutons d'installation ont été retirés sur demande.
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

    // Ne plus afficher les boutons d'installation (demande utilisateur)
    return null;
}
