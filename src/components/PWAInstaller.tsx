'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function PWAInstaller() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showInstallButton, setShowInstallButton] = useState(false);

    useEffect(() => {
        // Enregistrer le Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker
                    .register('/service-worker.js')
                    .then((registration) => {
                        console.log('SW registered:', registration);

                        // Vérifier les mises à jour toutes les heures
                        setInterval(() => {
                            registration.update();
                        }, 60 * 60 * 1000);

                        // Écouter les mises à jour
                        registration.addEventListener('updatefound', () => {
                            const newWorker = registration.installing;
                            if (newWorker) {
                                newWorker.addEventListener('statechange', () => {
                                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                        toast.info('Nouvelle version disponible', {
                                            description: 'Rechargez la page pour mettre à jour',
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
                    })
                    .catch((error) => {
                        console.error('SW registration failed:', error);
                    });
            });
        }

        // Gérer l'événement beforeinstallprompt pour l'installation PWA
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallButton(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Détecter si l'app est déjà installée
        window.addEventListener('appinstalled', () => {
            console.log('PWA installed');
            setShowInstallButton(false);
            toast.success('Application installée avec succès!');
        });

        // Vérifier le statut de connexion
        const handleOnline = () => {
            toast.success('Connexion rétablie');
        };

        const handleOffline = () => {
            toast.error('Vous êtes hors ligne', {
                description: 'Certaines fonctionnalités peuvent être limitées',
            });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        } else {
            console.log('User dismissed the install prompt');
        }

        setDeferredPrompt(null);
        setShowInstallButton(false);
    };

    // Bouton d'installation (optionnel, peut être affiché dans l'UI)
    if (showInstallButton) {
        return (
            <button
                onClick={handleInstallClick}
                className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg hover:bg-primary/90 transition-colors z-50"
            >
                Installer l'application
            </button>
        );
    }

    return null;
}
