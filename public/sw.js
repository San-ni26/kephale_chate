/**
 * Service Worker for Chat Mango
 * Handles: Push notifications (messages + calls), notification clicks,
 * precache des pages critiques, fetch handler pour mode hors ligne.
 * 
 * Compatible avec Safari iOS (gestion gracieuse de l'absence de caches API).
 */

// Version incrémentée à chaque déploiement pour invalider le cache
var CACHE_VERSION = 'mango-v4';
var PRECACHE_URLS = [
    '/',
    '/login',
    '/register',
    '/chat',
    '/offline',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// Vérifier si Cache API est disponible (Safari iOS mode privé = non)
var cacheAvailable = typeof caches !== 'undefined';

// ============ HELPERS CACHE SÉCURISÉS ============
function safeCachesOpen(cacheName) {
    if (!cacheAvailable) return Promise.resolve(null);
    return caches.open(cacheName).catch(function(err) {
        console.warn('[SW] Failed to open cache:', err);
        return null;
    });
}

function safeCachesMatch(request, cacheName) {
    if (!cacheAvailable) return Promise.resolve(null);
    if (cacheName) {
        return caches.open(cacheName).then(function(cache) {
            return cache.match(request);
        }).catch(function() { return null; });
    }
    return caches.match(request).catch(function() { return null; });
}

function safeCachePut(cache, request, response) {
    if (!cache || !cacheAvailable) return Promise.resolve();
    return cache.put(request, response).catch(function(err) {
        console.warn('[SW] Failed to put in cache:', err);
    });
}

function safeCachesDelete(cacheName) {
    if (!cacheAvailable) return Promise.resolve(false);
    return caches.delete(cacheName).catch(function() { return false; });
}

function safeCachesKeys() {
    if (!cacheAvailable) return Promise.resolve([]);
    return caches.keys().catch(function() { return []; });
}

// ============ MESSAGES DU CLIENT ============
var pathnameByClientId = {};
var lastKnownPathnames = [];

self.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'PUSH_SKIP_PATH' && event.data.pathname) {
        var clientId = event.source && event.source.id;
        var path = event.data.pathname;
        if (clientId) {
            pathnameByClientId[clientId] = path;
        }
        lastKnownPathnames.push(path);
        if (lastKnownPathnames.length > 10) lastKnownPathnames.shift();
    }
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] SKIP_WAITING received, activating...');
        self.skipWaiting();
    }
});

// ============ PUSH NOTIFICATION HANDLER ============
self.addEventListener('push', function (event) {
    console.log('[SW] Push event received');

    var data = {};
    if (event.data) {
        try {
            var parsed = event.data.json();
            data = parsed && typeof parsed === 'object' ? parsed : { title: 'Mango', body: 'Nouveau message' };
        } catch (e) {
            console.error('[SW] Failed to parse push data:', e);
            data = { title: 'Chat', body: event.data.text() || 'Nouveau message' };
        }
    } else {
        data = { title: 'Mango', body: 'Nouveau message' };
    }

    var isCall = data.type === 'call';
    var convId = data.data && data.data.conversationId;
    var orgId = data.data && data.data.orgId;
    var deptId = data.data && data.data.deptId;
    var collabId = data.data && data.data.collabId;
    var groupId = data.data && data.data.groupId;
    var tag = isCall ? 'incoming-call-' + Date.now() : 'message-' + (convId || Date.now());

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
            ? [{ action: 'answer', title: 'Repondre' }, { action: 'reject', title: 'Refuser' }]
            : [{ action: 'view', title: 'Voir' }]
    };

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length === 0) {
                return self.registration.showNotification(data.title || 'Chat', options).catch(function (err) {
                    console.warn('[SW] showNotification failed:', err);
                });
            }

            if (isCall) {
                var skipCall = false;
                if (convId) {
                    for (var ci = 0; ci < clientList.length; ci++) {
                        var cc = clientList[ci];
                        if (!cc.focused || !cc.url) continue;
                        try {
                            var ccPath = new URL(cc.url).pathname;
                            if (ccPath.indexOf('/chat/discussion/' + convId) !== -1) {
                                skipCall = true;
                                break;
                            }
                        } catch (e) { }
                    }
                }
                if (skipCall) return Promise.resolve();
            }

            if (!isCall) {
                var targetUrl = (data.url && typeof data.url === 'string') ? data.url.replace(/\/$/, '') : null;

                function pathMatchesByData(p) {
                    if (!p) return false;
                    if (p.indexOf('/chat/notifications') === 0) return true;
                    if (convId) {
                        var m = p.match(/^\/chat\/discussion\/([^/?]+)/);
                        if (m && m[1] === convId) return true;
                    }
                    if (orgId && deptId) {
                        var dm = p.match(/^\/chat\/organizations\/([^/]+)\/departments\/([^/]+)\/chat/);
                        if (dm && dm[1] === orgId && dm[2] === deptId) return true;
                    }
                    if (orgId && collabId && groupId) {
                        var cm = p.match(/^\/chat\/organizations\/([^/]+)\/collaborations\/([^/]+)\/groups\/([^/]+)\/chat/);
                        if (cm && cm[1] === orgId && cm[2] === collabId && cm[3] === groupId) return true;
                    }
                    return false;
                }

                var skip = false;
                var allPaths = lastKnownPathnames.slice();
                for (var i = 0; i < clientList.length; i++) {
                    var c = clientList[i];
                    if (c.url) {
                        try {
                            var pu = new URL(c.url).pathname;
                            if (pu && allPaths.indexOf(pu) === -1) allPaths.push(pu);
                        } catch (e) { }
                    }
                    if (c.id && pathnameByClientId[c.id] && allPaths.indexOf(pathnameByClientId[c.id]) === -1) {
                        allPaths.push(pathnameByClientId[c.id]);
                    }
                }
                for (var k = 0; k < allPaths.length; k++) {
                    if (pathMatchesByData(allPaths[k])) {
                        skip = true;
                        break;
                    }
                }
                if (skip) return Promise.resolve();
            }

            return self.registration.showNotification(data.title || 'Chat', options).catch(function (err) {
                console.warn('[SW] showNotification failed:', err);
            });
        })
    );
});

// ============ NOTIFICATION CLICK HANDLER ============
self.addEventListener('notificationclick', function (event) {
    var notification = event.notification;
    var action = event.action || '';
    var data = notification.data || {};
    var url = data.url || '/chat';
    var notifType = data.type || 'message';

    notification.close();

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
                        try { c.postMessage({ type: 'CALL_ENDED_BY_NOTIFICATION' }); } catch (e) { }
                    });
                    if (clientList.length > 0) return clientList[0].focus();
                }).catch(function (err) {
                    console.error('[SW] Failed to end call:', err);
                })
            );
        }
        return;
    }

    var convId = data.conversationId;
    var basePath = (url && url.startsWith('/')) ? url : ('/chat' + (convId ? '/discussion/' + convId : ''));
    if (notifType === 'call' && convId) {
        basePath = '/chat/discussion/' + convId;
        if (action === 'answer') basePath += '?answer=1';
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
                if (client.focus) return client.focus();
            }
            return self.clients.openWindow(fullUrl);
        })
    );
});

// ============ LIFECYCLE ============
self.addEventListener('install', function (event) {
    console.log('[SW] Installing version:', CACHE_VERSION, 'Cache available:', cacheAvailable);
    
    if (!cacheAvailable) {
        // Safari iOS mode privé - pas de cache mais on continue
        console.log('[SW] Cache API not available, skipping precache');
        event.waitUntil(self.skipWaiting());
        return;
    }
    
    event.waitUntil(
        safeCachesOpen(CACHE_VERSION).then(function (cache) {
            if (!cache) return;
            return cache.addAll(PRECACHE_URLS).catch(function (err) {
                console.warn('[SW] Precache failed for some URLs:', err);
            });
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function (event) {
    console.log('[SW] Activating version:', CACHE_VERSION);
    
    event.waitUntil(
        safeCachesKeys().then(function (keys) {
            return Promise.all(
                keys
                    .filter(function (k) { return k !== CACHE_VERSION; })
                    .map(function (k) { 
                        console.log('[SW] Deleting old cache:', k);
                        return safeCachesDelete(k); 
                    })
            );
        }).then(function () {
            return self.clients.claim();
        }).then(function () {
            return self.clients.matchAll().then(function (clients) {
                clients.forEach(function (client) {
                    client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VERSION });
                });
            });
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
            fetch(event.request)
                .then(function (response) {
                    if (response.ok && cacheAvailable) {
                        var clone = response.clone();
                        safeCachesOpen(CACHE_VERSION).then(function (cache) {
                            safeCachePut(cache, event.request, clone);
                        });
                    }
                    return response;
                })
                .catch(function () {
                    if (!cacheAvailable) {
                        return new Response(
                            '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;"><h1>Hors ligne</h1><p>Veuillez vérifier votre connexion internet.</p></body></html>',
                            { status: 503, headers: { 'Content-Type': 'text/html' } }
                        );
                    }
                    return safeCachesMatch(event.request, CACHE_VERSION).then(function (cached) {
                        if (cached) return cached;
                        return safeCachesMatch('/offline', CACHE_VERSION).then(function (offline) {
                            return offline || new Response(
                                '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;"><h1>Hors ligne</h1><p>Veuillez vérifier votre connexion internet.</p></body></html>',
                                { status: 503, headers: { 'Content-Type': 'text/html' } }
                            );
                        });
                    });
                })
        );
        return;
    }

    // Assets statiques : cache-first pour performance
    if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
        if (!cacheAvailable) return; // Pas de cache = pas d'interception
        
        event.respondWith(
            safeCachesMatch(event.request, CACHE_VERSION).then(function (cached) {
                if (cached) return cached;
                return fetch(event.request).then(function (res) {
                    if (!res || res.status !== 200 || res.type !== 'basic') return res;
                    var clone = res.clone();
                    safeCachesOpen(CACHE_VERSION).then(function (cache) {
                        safeCachePut(cache, event.request, clone);
                    });
                    return res;
                });
            })
        );
        return;
    }

    // GET /api/* : network-first, cache fallback
    if (url.pathname.startsWith('/api/') && event.request.method === 'GET' && cacheAvailable) {
        var apiCacheName = CACHE_VERSION + '-api';
        event.respondWith(
            fetch(event.request)
                .then(function (res) {
                    if (res.ok && res.status === 200) {
                        var clone = res.clone();
                        safeCachesOpen(apiCacheName).then(function (cache) {
                            safeCachePut(cache, event.request, clone);
                        });
                    }
                    return res;
                })
                .catch(function () {
                    return safeCachesMatch(event.request, apiCacheName).then(function (cached) {
                        return cached || new Response(
                            JSON.stringify({ error: 'Hors ligne', offline: true }), 
                            { status: 503, headers: { 'Content-Type': 'application/json' } }
                        );
                    });
                })
        );
        return;
    }
});

// ============ BACKGROUND SYNC ============
var DB_NAME = 'mango-offline-queue';
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
                if (items.length === 0) {
                    resolve({ sent: 0, failed: 0 });
                    return;
                }
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
                                        try { 
                                            c.postMessage({ type: 'QUEUE_ITEM_SENT', tempId: item.tempId, itemId: item.id }); 
                                        } catch (e) { }
                                    });
                                });
                            }).then(function () { return { success: true }; });
                        }
                        return { success: false };
                    }).catch(function () { return { success: false }; });
                })).then(function (results) {
                    var sent = results.filter(function (r) { return r.success; }).length;
                    resolve({ sent: sent, failed: items.length - sent });
                });
            };
            req.onerror = function () { resolve({ sent: 0, failed: 0 }); };
        });
    });
}

self.addEventListener('sync', function (event) {
    if (event.tag === 'mango-send-messages') {
        event.waitUntil(swProcessQueue());
    }
});
