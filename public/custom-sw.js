
self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json();
        const isCall = data.type === 'call';

        const options = {
            body: data.body,
            icon: data.icon || '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            vibrate: isCall ? [200, 100, 200, 100, 200, 100, 200] : [100, 50, 100],
            tag: isCall ? 'incoming-call' : ('message-' + (data.data?.conversationId || Date.now())),
            renotify: true,
            requireInteraction: isCall,
            silent: false,
            data: {
                dateOfArrival: Date.now(),
                url: data.url || '/',
                type: data.type || 'message',
                conversationId: data.data?.conversationId,
                messageId: data.data?.messageId,
                callerId: data.data?.callerId,
            },
            actions: isCall ? [
                { action: 'answer', title: 'Repondre', icon: '/icons/icon-192x192.png' },
                { action: 'reject', title: 'Refuser', icon: '/icons/icon-192x192.png' }
            ] : [
                { action: 'view', title: 'Voir' }
            ]
        };

        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
                const urlToOpen = data.url || '/';

                // For messages: check if user has a focused window on this conversation
                if (!isCall) {
                    for (var i = 0; i < clientList.length; i++) {
                        var client = clientList[i];
                        if (client.focused && 'url' in client && client.url.includes(urlToOpen)) {
                            return; // User is looking at the conversation, skip notification
                        }
                    }
                }

                return self.registration.showNotification(data.title, options);
            })
        );
    }
});

self.addEventListener('notificationclick', function (event) {
    var notification = event.notification;
    var action = event.action;
    var url = notification.data.url || '/';

    notification.close();

    if (action === 'reject') {
        // Send rejection signal to the server via fetch
        var callerId = notification.data.callerId;
        if (callerId) {
            event.waitUntil(
                fetch('/api/call/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'call:reject',
                        callerId: callerId,
                    }),
                }).catch(function (err) {
                    console.error('Failed to send call rejection from SW:', err);
                })
            );
        }
        return;
    }

    // For 'answer', 'view', or default click: navigate to the conversation
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Try to find an existing window and navigate it
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if ('navigate' in client) {
                    return client.focus().then(function () {
                        return client.navigate(url);
                    });
                }
            }
            // No existing window, open a new one
            return clients.openWindow(url);
        })
    );
});

// Handle service worker activation
self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});
