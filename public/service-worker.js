// Service Worker pour Chat Kephale
// Version: 1.0.0

const CACHE_NAME = 'kephale-chat-v1';
const RUNTIME_CACHE = 'kephale-runtime-v1';
const IMAGE_CACHE = 'kephale-images-v1';

// Ressources à mettre en cache lors de l'installation
const PRECACHE_URLS = [
    '/',
    '/login',
    '/register',
    '/chat',
    '/offline',
    '/manifest.json',
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Precaching App Shell');
            return cache.addAll(PRECACHE_URLS).catch((err) => {
                console.error('[SW] Precache failed:', err);
            });
        })
    );
    self.skipWaiting();
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME &&
                        cacheName !== RUNTIME_CACHE &&
                        cacheName !== IMAGE_CACHE) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Stratégie de cache pour les requêtes
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorer les requêtes non-GET
    if (request.method !== 'GET') {
        return;
    }

    // Ignorer les requêtes vers d'autres origines (sauf fonts et images)
    if (url.origin !== self.location.origin &&
        !url.href.includes('fonts.googleapis.com') &&
        !url.href.includes('fonts.gstatic.com')) {
        return;
    }

    // Stratégie pour les API calls: Network First
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Clone la réponse pour la mettre en cache
                    const responseClone = response.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Si offline, essayer de récupérer depuis le cache
                    return caches.match(request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        // Retourner une réponse d'erreur JSON
                        return new Response(
                            JSON.stringify({ error: 'Vous êtes hors ligne' }),
                            {
                                status: 503,
                                headers: { 'Content-Type': 'application/json' },
                            }
                        );
                    });
                })
        );
        return;
    }

    // Stratégie pour les images: Cache First
    if (request.destination === 'image' ||
        url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/)) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(IMAGE_CACHE).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                });
            })
        );
        return;
    }

    // Stratégie pour les fonts: Cache First
    if (url.href.includes('fonts.googleapis.com') ||
        url.href.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                return cachedResponse || fetch(request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                });
            })
        );
        return;
    }

    // Stratégie par défaut: Network First avec fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Ne pas mettre en cache les réponses non-OK
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }

                const responseClone = response.clone();
                caches.open(RUNTIME_CACHE).then((cache) => {
                    cache.put(request, responseClone);
                });

                return response;
            })
            .catch(() => {
                // Si offline, essayer le cache
                return caches.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    // Fallback vers la page offline pour les navigations
                    if (request.destination === 'document') {
                        return caches.match('/offline');
                    }

                    // Pour les autres ressources, retourner une réponse vide
                    return new Response('Offline', {
                        status: 503,
                        statusText: 'Service Unavailable',
                    });
                });
            })
    );
});

// Gestion des messages du client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(RUNTIME_CACHE).then((cache) => {
                return cache.addAll(event.data.payload);
            })
        );
    }
});

// Notification de mise à jour disponible
self.addEventListener('controllerchange', () => {
    console.log('[SW] New Service Worker activated');
});
