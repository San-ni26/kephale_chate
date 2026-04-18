'use client';

/**
 * Enregistre le Service Worker dès le chargement de l'app.
 * Gestion améliorée des mises à jour avec toast de notification.
 * Doit être au plus haut niveau (root layout) pour que les push
 * fonctionnent quand l'onglet/navigateur est fermé.
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

export function ServiceWorkerRegistration() {
    const updateToastId = useRef<string | number | null>(null);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        const register = async () => {
            try {
                // Nettoyer les anciens SW qui ne sont pas /sw.js
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

                console.log('[SW] Registered:', registration.scope);

                // Gestion des mises à jour
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    
                    if (newWorker) {
                        console.log('[SW] New version found, installing...');
                        
                        newWorker.addEventListener('statechange', () => {
                            // SW installé et il y a déjà un SW actif = mise à jour disponible
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('[SW] Update ready to activate');
                                
                                // Afficher toast persistant pour mise à jour
                                if (!updateToastId.current) {
                                    updateToastId.current = toast.info(
                                        'Nouvelle version disponible',
                                        {
                                            description: 'Une mise à jour de l\'application est prête à être installée.',
                                            action: {
                                                label: 'Mettre à jour',
                                                onClick: () => {
                                                    // Forcer le nouveau SW à prendre le contrôle
                                                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                                                    
                                                    // Attendre que le SW soit activé puis recharger
                                                    newWorker.addEventListener('statechange', () => {
                                                        if (newWorker.state === 'activated') {
                                                            window.location.reload();
                                                        }
                                                    });
                                                },
                                            },
                                            duration: Infinity, // Persistant jusqu'à action utilisateur
                                        }
                                    );
                                }
                            }
                            
                            // SW activé
                            if (newWorker.state === 'activated') {
                                console.log('[SW] Activated successfully');
                            }
                        });
                    }
                });

                // Vérifier si un SW est en attente au chargement
                if (registration.waiting && navigator.serviceWorker.controller) {
                    console.log('[SW] Update waiting on load');
                    
                    if (!updateToastId.current) {
                        updateToastId.current = toast.info(
                            'Mise à jour en attente',
                            {
                                description: 'Une nouvelle version est disponible.',
                                action: {
                                    label: 'Mettre à jour maintenant',
                                    onClick: () => {
                                        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
                                        window.location.reload();
                                    },
                                },
                                duration: Infinity,
                            }
                        );
                    }
                }

                // Écouter les messages du SW
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data?.type === 'SW_ACTIVATED') {
                        console.log('[SW] Message received: SW activated');
                    }
                });

            } catch (err) {
                console.error('[SW] Registration failed:', err);
            }
        };

        if (document.readyState === 'complete') {
            register();
        } else {
            window.addEventListener('load', register, { once: true });
        }

        // Cleanup
        return () => {
            if (updateToastId.current) {
                toast.dismiss(updateToastId.current);
            }
        };
    }, []);

    return null;
}
