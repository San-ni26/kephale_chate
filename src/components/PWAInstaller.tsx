'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function PWAInstaller() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showInstallButton, setShowInstallButton] = useState(false);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        const setupServiceWorker = async () => {
            try {
                // First: unregister any old/wrong service workers
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const reg of registrations) {
                    const swUrl = reg.active?.scriptURL || reg.installing?.scriptURL || '';
                    // If this is the old service-worker.js, kill it
                    if (swUrl.includes('service-worker.js') && !swUrl.includes('custom-sw.js')) {
                        console.log('[SW] Unregistering old SW:', swUrl);
                        await reg.unregister();
                    }
                }

                // Determine which SW to register
                // In production build: next-pwa generates sw.js which includes custom-sw.js
                // In dev mode: sw.js may not exist, so register custom-sw.js directly
                let swPath = '/sw.js';
                
                // Check if sw.js exists (production build)
                try {
                    const resp = await fetch('/sw.js', { method: 'HEAD' });
                    if (!resp.ok) {
                        swPath = '/custom-sw.js';
                    }
                } catch {
                    swPath = '/custom-sw.js';
                }

                console.log('[SW] Registering:', swPath);
                const registration = await navigator.serviceWorker.register(swPath, {
                    updateViaCache: 'none', // Always check for updates
                });
                console.log('[SW] Registered successfully, scope:', registration.scope);

                // Force update check
                await registration.update();

                // If there's a waiting worker, activate it immediately
                if (registration.waiting) {
                    console.log('[SW] New SW waiting, activating...');
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }

                // Listen for future updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed') {
                                if (navigator.serviceWorker.controller) {
                                    // New SW ready, activate it
                                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                                    toast.info('Mise a jour disponible', {
                                        description: 'Rechargez pour appliquer',
                                        action: {
                                            label: 'Recharger',
                                            onClick: () => window.location.reload(),
                                        },
                                        duration: 10000,
                                    });
                                } else {
                                    console.log('[SW] SW installed for the first time');
                                }
                            }
                        });
                    }
                });

                // Check updates every 30 minutes
                setInterval(() => registration.update(), 30 * 60 * 1000);

            } catch (error) {
                console.error('[SW] Setup failed:', error);
            }
        };

        // Run after page load
        if (document.readyState === 'complete') {
            setupServiceWorker();
        } else {
            window.addEventListener('load', setupServiceWorker, { once: true });
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

        const handleOnline = () => toast.success('Connexion retablie');
        const handleOffline = () => toast.error('Hors ligne');

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
        if (outcome === 'accepted') console.log('[PWA] Installed');
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
