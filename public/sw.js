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

    // Appels : toujours afficher. Messages : ne pas afficher si l'utilisateur a déjà la conversation ouverte et focalisée.
    // Quand l'app est fermée (clientList vide), on affiche toujours.
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (!isCall && data.url && clientList.length > 0) {
                for (var i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused && clientList[i].url && clientList[i].url.indexOf(data.url) !== -1) {
                        console.log('[SW] User is viewing conversation, skip notification');
                        return Promise.resolve();
                    }
                }
            }

            console.log('[SW] Showing notification:', data.title || 'Chat');
            return self.registration.showNotification(data.title || 'Chat', options);
        })
    );
});

// ============ NOTIFICATION CLICK HANDLER ============
self.addEventListener('notificationclick', function (event) {
    console.log('[SW] Notification clicked, action:', event.action);

    var notification = event.notification;
    var action = event.action;
    var url = (notification.data && notification.data.url) || '/chat';

    notification.close();

    if (action === 'reject') {
        var callerId = notification.data && notification.data.callerId;
        if (callerId) {
            event.waitUntil(
                fetch('/api/call/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'call:reject',
                        callerId: callerId,
                    }),
                    credentials: 'same-origin',
                }).catch(function (err) {
                    console.error('[SW] Failed to send call rejection:', err);
                })
            );
        }
        return;
    }

    // URL absolue requise pour openWindow quand le navigateur est ferme
    var fullUrl = url.startsWith('/') ? self.location.origin + url : url;

    // Ouvrir la conversation : réutiliser une fenêtre existante ou ouvrir une nouvelle (app fermée).
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                var client = clientList[0];
                if (client.focus && client.navigate) {
                    return client.focus().then(function (c) {
                        return c.navigate ? c.navigate(url) : Promise.resolve();
                    });
                }
                if (client.focus) {
                    return client.focus();
                }
            }
            // Aucune fenêtre ouverte (app fermée) : ouvrir l'URL en nouvelle fenêtre/onglet
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
