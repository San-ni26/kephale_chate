'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * PWAInstaller : prompt d'installation + écoute des mises à jour du SW.
 * L'enregistrement du SW est géré par ServiceWorkerRegistration (évite doublon).
 */
export function PWAInstaller() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showInstallButton, setShowInstallButton] = useState(false);

    useEffect(() => {
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
                                toast.info('Mise a jour disponible', {
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

        // PWA install prompt
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallButton(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', () => {
            setShowInstallButton(false);
            toast.success('Application installee!');
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    if (showInstallButton) {
        return (
            <button
                onClick={async () => {
                    if (!deferredPrompt) return;
                    deferredPrompt.prompt();
                    await deferredPrompt.userChoice;
                    setDeferredPrompt(null);
                    setShowInstallButton(false);
                }}
                className="fixed bottom-20 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg hover:bg-primary/90 transition-colors z-50 md:bottom-4"
            >
                Installer l'application
            </button>
        );
    }

    return null;
}
