/**
 * Custom Service Worker for Chat Kephale
 * Handles: Push notifications (messages + calls), notification clicks
 * 
 * This file is either:
 * 1. Imported by next-pwa's generated sw.js via importScripts (production)
 * 2. Registered directly as standalone SW (development fallback)
 */

// ============ PUSH NOTIFICATION HANDLER ============
self.addEventListener('push', function (event) {
    console.log('[SW] Push received:', event);
    
    if (!event.data) {
        console.log('[SW] Push event but no data');
        return;
    }

    var data;
    try {
        data = event.data.json();
    } catch (e) {
        console.error('[SW] Failed to parse push data:', e);
        // Fallback: show raw text
        data = {
            title: 'Kephale Chat',
            body: event.data.text(),
        };
    }

    console.log('[SW] Push data:', JSON.stringify(data));

    var isCall = data.type === 'call';

    var options = {
        body: data.body || '',
        icon: data.icon || '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: isCall ? [300, 100, 300, 100, 300, 100, 300] : [200, 100, 200],
        tag: isCall ? 'incoming-call-' + Date.now() : ('message-' + (data.data && data.data.conversationId || Date.now())),
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
        actions: isCall ? [
            { action: 'answer', title: 'Repondre' },
            { action: 'reject', title: 'Refuser' }
        ] : [
            { action: 'view', title: 'Voir' }
        ]
    };

    // For calls: ALWAYS show notification (even if app is focused)
    // For messages: skip if user is already viewing that conversation
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (!isCall) {
                var urlToCheck = data.url || '/chat';
                for (var i = 0; i < clientList.length; i++) {
                    var client = clientList[i];
                    if (client.focused && client.url && client.url.indexOf(urlToCheck) !== -1) {
                        console.log('[SW] User is viewing conversation, skipping notification');
                        return;
                    }
                }
            }

            console.log('[SW] Showing notification:', data.title);
            return self.registration.showNotification(data.title || 'Kephale Chat', options);
        })
    );
});

// ============ NOTIFICATION CLICK HANDLER ============
self.addEventListener('notificationclick', function (event) {
    console.log('[SW] Notification click:', event.action);
    
    var notification = event.notification;
    var action = event.action;
    var url = notification.data && notification.data.url || '/chat';

    notification.close();

    if (action === 'reject') {
        // Send call rejection to server
        var callerId = notification.data && notification.data.callerId;
        if (callerId) {
            event.waitUntil(
                // Get cookies from a client for auth
                self.clients.matchAll({ type: 'window' }).then(function (clients) {
                    return fetch('/api/call/signal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'call:reject',
                            callerId: callerId,
                        }),
                        credentials: 'same-origin',
                    });
                }).catch(function (err) {
                    console.error('[SW] Failed to send call rejection:', err);
                })
            );
        }
        return;
    }

    // For 'answer', 'view', or default click: navigate to conversation
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Try to focus an existing window first
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if ('focus' in client) {
                    return client.focus().then(function (focusedClient) {
                        if ('navigate' in focusedClient) {
                            return focusedClient.navigate(url);
                        }
                    });
                }
            }
            // No existing window - open new
            return self.clients.openWindow(url);
        })
    );
});

// ============ LIFECYCLE HANDLERS ============
self.addEventListener('install', function (event) {
    console.log('[SW] Custom SW installed');
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    console.log('[SW] Custom SW activated');
    event.waitUntil(self.clients.claim());
});
