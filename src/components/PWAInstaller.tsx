'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function PWAInstaller() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showInstallButton, setShowInstallButton] = useState(false);

    useEffect(() => {
        // Register the correct Service Worker
        // In production: next-pwa auto-registers sw.js (which imports custom-sw.js for push)
        // In development: we manually register custom-sw.js directly for push notifications
        if ('serviceWorker' in navigator) {
            const registerSW = async () => {
                try {
                    // Check if next-pwa's sw.js already registered (production)
                    const existingReg = await navigator.serviceWorker.getRegistration('/');
                    
                    if (existingReg) {
                        console.log('[SW] Already registered:', existingReg.scope);
                        
                        // Check for updates every hour
                        setInterval(() => existingReg.update(), 60 * 60 * 1000);
                        
                        existingReg.addEventListener('updatefound', () => {
                            const newWorker = existingReg.installing;
                            if (newWorker) {
                                newWorker.addEventListener('statechange', () => {
                                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                        toast.info('Nouvelle version disponible', {
                                            description: 'Rechargez la page pour mettre a jour',
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
                    } else {
                        // No SW registered yet - register custom-sw.js for push support
                        // This handles the dev case and the case before next-pwa kicks in
                        const reg = await navigator.serviceWorker.register('/custom-sw.js');
                        console.log('[SW] Registered custom-sw.js:', reg.scope);
                    }
                } catch (error) {
                    console.error('[SW] Registration failed:', error);
                }
            };

            // Wait for page load to not compete with other resources
            if (document.readyState === 'complete') {
                registerSW();
            } else {
                window.addEventListener('load', () => registerSW());
            }
        }

        // Handle PWA install prompt
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallButton(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        window.addEventListener('appinstalled', () => {
            console.log('[PWA] Installed');
            setShowInstallButton(false);
            toast.success('Application installee avec succes!');
        });

        const handleOnline = () => toast.success('Connexion retablie');
        const handleOffline = () => toast.error('Vous etes hors ligne', {
            description: 'Certaines fonctionnalites peuvent etre limitees',
        });

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
            console.log('[PWA] User accepted install');
        }

        setDeferredPrompt(null);
        setShowInstallButton(false);
    };

    if (showInstallButton) {
        return (
            <button
                onClick={handleInstallClick}
                className="fixed bottom-20 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg hover:bg-primary/90 transition-colors z-50 md:bottom-4"
            >
                Installer l'application
            </button>
        );
    }

    return null;
}
