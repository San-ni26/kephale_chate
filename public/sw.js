/**
 * Service Worker for Chat Kephale
 * Handles: Push notifications (messages + calls), notification clicks,
 * precache des pages critiques, fetch handler pour mode hors ligne.
 * Push notifications work on all platforms including Vercel.
 */

var CACHE_VERSION = 'kephale-v1';
var PRECACHE_URLS = ['/', '/login', '/register', '/chat', '/offline', '/manifest.json', '/icons/icon-192x192.png', '/icons/icon-512x512.png'];

// ============ PUSH NOTIFICATION HANDLER ============
// S'affiche même quand l'app est fermée (navigateur ou onglet) : le SW reste actif pour les push.
self.addEventListener('push', function (event) {
    console.log('[SW] Push event received');

    var data = {};
    if (event.data) {
        try {
            var parsed = event.data.json();
            data = parsed && typeof parsed === 'object' ? parsed : { title: 'Kephale', body: 'Nouveau message' };
        } catch (e) {
            console.error('[SW] Failed to parse push data:', e);
            data = {
                title: 'Chat',
                body: event.data.text() || 'Nouveau message',
            };
        }
    } else {
        data = { title: 'Kephale', body: 'Nouveau message' };
    }

    console.log('[SW] Push data parsed:', data.title, data.type);

    var isCall = data.type === 'call';
    var convId = data.data && data.data.conversationId;
    var tag = isCall
        ? 'incoming-call-' + Date.now()
        : 'message-' + (convId || Date.now());

    var options = {
        body: data.body || 'Nouveau message',
        icon: data.icon || '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: isCall ? [300, 100, 300, 100, 300, 100, 300] : [200, 100, 200],
        tag: tag,
        renotify: true,
        requireInteraction: isCall,
        silent: false,
        data: {
            dateOfArrival: Date.now(),
            url: data.url || '/chat',
            type: data.type || 'message',
            conversationId: convId,
            messageId: data.data && data.data.messageId,
            callerId: data.data && data.data.callerId,
        },
        actions: isCall
            ? [
                { action: 'answer', title: 'Repondre' },
                { action: 'reject', title: 'Refuser' }
            ]
            : [
                { action: 'view', title: 'Voir' }
            ]
    };

    // Messages : ne pas afficher si l'utilisateur a déjà la conversation ouverte et focalisée.
    // Appels : ne pas afficher si l'app est ouverte et focalisée (Pusher gere en temps reel).
    // Quand l'app est fermée (clientList vide), on affiche toujours.
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                var hasFocused = clientList.some(function (c) { return c.focused; });
                if (hasFocused) {
                    if (isCall) {
                        console.log('[SW] App ouverte et focalisee, skip notification appel (Pusher gere)');
                        return Promise.resolve();
                    }
                    if (data.url) {
                        for (var i = 0; i < clientList.length; i++) {
                            if (clientList[i].focused && clientList[i].url && clientList[i].url.indexOf(data.url) !== -1) {
                                console.log('[SW] User is viewing conversation, skip notification');
                                return Promise.resolve();
                            }
                        }
                    }
                }
            }

            console.log('[SW] Showing notification:', data.title || 'Chat');
            return self.registration.showNotification(data.title || 'Chat', options).catch(function (err) {
                console.warn('[SW] showNotification failed:', err);
            });
        })
    );
});

// ============ NOTIFICATION CLICK HANDLER ============
self.addEventListener('notificationclick', function (event) {
    console.log('[SW] Notification clicked, action:', event.action, 'type:', event.notification.data && event.notification.data.type);

    var notification = event.notification;
    var action = event.action || '';
    var data = notification.data || {};
    var url = data.url || '/chat';
    var notifType = data.type || 'message';

    notification.close();

    // Appel entrant : Refuser
    if (action === 'reject') {
        var callerId = data.callerId;
        if (callerId) {
            event.waitUntil(
                fetch('/api/call/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'call:reject', callerId: callerId }),
                    credentials: 'include',
                }).catch(function (err) {
                    console.error('[SW] Failed to send call rejection:', err);
                })
            );
        }
        return;
    }

    // Appel en cours : Raccrocher (depuis notification "Appel en cours")
    if (notifType === 'active_call' && action === 'hangup') {
        var targetUserId = data.targetUserId;
        if (targetUserId) {
            event.waitUntil(
                fetch('/api/call/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'call:end', targetUserId: targetUserId }),
                    credentials: 'include',
                }).then(function () {
                    return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                }).then(function (clientList) {
                    clientList.forEach(function (c) {
                        try { c.postMessage({ type: 'CALL_ENDED_BY_NOTIFICATION' }); } catch (e) {}
                    });
                    if (clientList.length > 0) {
                        return clientList[0].focus();
                    }
                    return Promise.resolve();
                }).catch(function (err) {
                    console.error('[SW] Failed to end call:', err);
                })
            );
        }
        return;
    }

    // Repondre (appel entrant) ou Ouvrir (appel en cours) : ouvrir/focus la conversation
    var convId = data.conversationId;
    var basePath = (url && url.startsWith('/')) ? url : ('/chat' + (convId ? '/discussion/' + convId : ''));
    if (notifType === 'call' && convId) {
        basePath = '/chat/discussion/' + convId;
        if (action === 'answer') {
            basePath += '?answer=1';
        }
    }
    var fullUrl = self.location.origin + basePath;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                var client = clientList[0];
                if (client.focus && client.navigate) {
                    return client.focus().then(function (c) {
                        return c.navigate ? c.navigate(fullUrl) : Promise.resolve();
                    });
                }
                if (client.focus) {
                    return client.focus();
                }
            }
            return self.clients.openWindow(fullUrl);
        })
    );
});

// ============ LIFECYCLE ============
self.addEventListener('install', function (event) {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_VERSION).then(function (cache) {
            return cache.addAll(PRECACHE_URLS).catch(function (err) {
                console.warn('[SW] Precache failed for some URLs:', err);
            });
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function (event) {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
        }).then(function () {
            return self.clients.claim();
        })
    );
});

// ============ FETCH HANDLER (offline support) ============
self.addEventListener('fetch', function (event) {
    var url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // Navigation : network-first, fallback cache, puis /offline si hors ligne
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(function () {
                return caches.match(event.request).then(function (cached) {
                    if (cached) return cached;
                    return caches.match('/offline').then(function (offline) {
                        return offline || new Response('Hors ligne', { status: 503, statusText: 'Service Unavailable' });
                    });
                });
            })
        );
        return;
    }

    // Assets statiques : cache-first pour perf
    if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
        event.respondWith(
            caches.match(event.request).then(function (cached) {
                if (cached) return cached;
                return fetch(event.request).then(function (res) {
                    var clone = res.clone();
                    caches.open(CACHE_VERSION).then(function (cache) { cache.put(event.request, clone); });
                    return res;
                });
            })
        );
        return;
    }

    // GET /api/* : network-first, cache fallback pour consultation hors ligne (TTL ~5 min via nom de cache)
    if (url.pathname.startsWith('/api/') && event.request.method === 'GET') {
        var apiCacheName = CACHE_VERSION + '-api';
        event.respondWith(
            fetch(event.request).then(function (res) {
                if (res.ok && res.status === 200) {
                    var clone = res.clone();
                    caches.open(apiCacheName).then(function (cache) { cache.put(event.request, clone); });
                }
                return res;
            }).catch(function () {
                return caches.open(apiCacheName).then(function (cache) {
                    return cache.match(event.request);
                }).then(function (cached) {
                    return cached || new Response(JSON.stringify({ error: 'Hors ligne' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
                });
            })
        );
        return;
    }

    // API POST/PATCH/DELETE : network only
});

// ============ BACKGROUND SYNC (file messages hors ligne) ============
var DB_NAME = 'kephale-offline-queue';
var STORE_NAME = 'messages';

function swOpenDB() {
    return new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB_NAME, 1);
        req.onerror = function () { reject(req.error); };
        req.onsuccess = function () { resolve(req.result); };
        req.onupgradeneeded = function (e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

function swProcessQueue() {
    return swOpenDB().then(function (db) {
        return new Promise(function (resolve) {
            var tx = db.transaction(STORE_NAME, 'readonly');
            var store = tx.objectStore(STORE_NAME);
            var req = store.getAll();
            req.onsuccess = function () {
                var items = req.result || [];
                db.close();
                Promise.all(items.map(function (item) {
                    return fetch(item.url, {
                        method: item.method,
                        headers: { 'Content-Type': 'application/json' },
                        body: item.body,
                        credentials: 'include',
                    }).then(function (res) {
                        if (res.ok) {
                            return swOpenDB().then(function (db2) {
                                return new Promise(function (res2) {
                                    var tx2 = db2.transaction(STORE_NAME, 'readwrite');
                                    tx2.objectStore(STORE_NAME).delete(item.id);
                                    tx2.oncomplete = function () { db2.close(); res2(); };
                                });
                            }).then(function () {
                                return self.clients.matchAll().then(function (clients) {
                                    clients.forEach(function (c) {
                                        try { c.postMessage({ type: 'QUEUE_ITEM_SENT', tempId: item.tempId, itemId: item.id }); } catch (e) {}
                                    });
                                });
                            });
                        }
                        return Promise.resolve();
                    }).catch(function () { return Promise.resolve(); });
                })).then(resolve);
            };
        });
    });
}

self.addEventListener('sync', function (event) {
    if (event.tag === 'kephale-send-messages') {
        event.waitUntil(swProcessQueue());
    }
});

// Handle skip waiting message from client
self.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
