/**
 * Service Worker for Chat Kephale
 * Handles: Push notifications (messages + calls), notification clicks
 * This is the ONLY service worker - no Workbox, no precaching.
 * Push notifications work on all platforms including Vercel.
 */

// ============ PUSH NOTIFICATION HANDLER ============
self.addEventListener('push', function (event) {
    console.log('[SW] Push event received');

    if (!event.data) {
        console.log('[SW] Push event has no data');
        return;
    }

    var data;
    try {
        data = event.data.json();
    } catch (e) {
        console.error('[SW] Failed to parse push data:', e);
        data = {
            title: 'Kephale Chat',
            body: event.data.text() || 'Nouveau message',
        };
    }

    console.log('[SW] Push data parsed:', data.title, data.type);

    var isCall = data.type === 'call';

    var options = {
        body: data.body || 'Nouveau message',
        icon: data.icon || '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: isCall ? [300, 100, 300, 100, 300, 100, 300] : [200, 100, 200],
        tag: isCall
            ? 'incoming-call-' + Date.now()
            : 'message-' + (data.data && data.data.conversationId || Date.now()),
        renotify: true,
        requireInteraction: isCall,
        silent: false,
        data: {
            dateOfArrival: Date.now(),
            url: data.url || '/chat',
            type: data.type || 'message',
            conversationId: data.data && data.data.conversationId,
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

    // For calls: ALWAYS show notification
    // For messages: skip if user is already viewing that conversation in a focused window
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (!isCall && data.url) {
                for (var i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused && clientList[i].url && clientList[i].url.indexOf(data.url) !== -1) {
                        console.log('[SW] User is viewing conversation, skip notification');
                        return;
                    }
                }
            }

            console.log('[SW] Showing notification:', data.title || 'Kephale Chat');
            return self.registration.showNotification(data.title || 'Kephale Chat', options);
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

    // Navigate to the conversation
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if ('focus' in client) {
                    return client.focus().then(function (c) {
                        if ('navigate' in c) return c.navigate(url);
                    });
                }
            }
            return self.clients.openWindow(url);
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
