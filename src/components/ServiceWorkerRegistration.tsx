'use client';

/**
 * Enregistre le Service Worker dès le chargement de l'app.
 * Doit être au plus haut niveau (root layout) pour que les push
 * fonctionnent quand l'onglet/navigateur est fermé.
 */

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        const register = async () => {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const reg of registrations) {
                    const swUrl = reg.active?.scriptURL || reg.installing?.scriptURL || '';
                    if (!swUrl.endsWith('/sw.js')) {
                        await reg.unregister();
                    }
                }

                const registration = await navigator.serviceWorker.register('/sw.js', {
                    updateViaCache: 'none',
                    scope: '/', // Nécessaire pour recevoir les push quand l'app est fermée
                });

                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
            } catch (err) {
                console.error('[SW] Registration failed:', err);
            }
        };

        if (document.readyState === 'complete') {
            register();
        } else {
            window.addEventListener('load', register, { once: true });
        }
    }, []);

    return null;
}
