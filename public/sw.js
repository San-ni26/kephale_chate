/**
 * Service Worker for Chat Kephale
 * Handles: Push notifications (messages + calls), notification clicks
 * This is the ONLY service worker - no Workbox, no precaching.
 * Push notifications work on all platforms including Vercel.
 */

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
    var fullUrl = url.startsWith('/') ? self.location.origin + url : url;
    if (notifType === 'call' && convId && !url.includes(convId)) {
        fullUrl = self.location.origin + '/chat/discussion/' + convId;
    }

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                var client = clientList[0];
                if (client.focus && client.navigate) {
                    var targetUrl = fullUrl.replace(self.location.origin, '') || '/chat';
                    return client.focus().then(function (c) {
                        return c.navigate ? c.navigate(targetUrl) : Promise.resolve();
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
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    console.log('[SW] Activating...');
    event.waitUntil(self.clients.claim());
});

// Handle skip waiting message from client
self.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
