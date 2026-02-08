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
                // Unregister ALL old service workers first
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const reg of registrations) {
                    const swUrl = reg.active?.scriptURL || reg.installing?.scriptURL || '';
                    // Kill anything that's NOT our sw.js
                    if (!swUrl.endsWith('/sw.js')) {
                        console.log('[SW] Removing old SW:', swUrl);
                        await reg.unregister();
                    }
                }

                // Register our sw.js
                console.log('[SW] Registering /sw.js');
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    updateViaCache: 'none',
                });
                console.log('[SW] Registered, scope:', registration.scope);

                // Force update
                await registration.update().catch(() => {});

                // If waiting, activate immediately
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }

                // Handle future updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed') {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                                if (navigator.serviceWorker.controller) {
                                    toast.info('Mise a jour disponible', {
                                        action: {
                                            label: 'Recharger',
                                            onClick: () => window.location.reload(),
                                        },
                                        duration: 10000,
                                    });
                                }
                            }
                        });
                    }
                });

                // Periodic update check
                setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000);

            } catch (error) {
                console.error('[SW] Setup failed:', error);
            }
        };

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
