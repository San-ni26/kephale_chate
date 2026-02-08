
self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json();
        const isCall = data.type === 'call';

        const options = {
            body: data.body,
            icon: data.icon || '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            vibrate: isCall ? [200, 100, 200, 100, 200] : [100, 50, 100],
            tag: isCall ? 'incoming-call' : ('message-' + (data.data?.messageId || Date.now())),
            renotify: true,
            requireInteraction: isCall, // Keep call notifications until user interacts
            data: {
                dateOfArrival: Date.now(),
                primaryKey: '2',
                url: data.url || '/',
                type: data.type || 'message',
                conversationId: data.data?.conversationId,
                messageId: data.data?.messageId
            },
            actions: isCall ? [
                { action: 'answer', title: 'Répondre' },
                { action: 'reject', title: 'Refuser' }
            ] : [
                { action: 'view', title: 'Voir' }
            ]
        };

        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
                const urlToOpen = data.url || '/';

                // For messages: check if user has a focused window on this conversation
                if (!isCall) {
                    for (let i = 0; i < clientList.length; i++) {
                        const client = clientList[i];
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
    const notification = event.notification;
    const action = event.action;
    const url = notification.data.url || '/';

    notification.close();

    if (action === 'reject') {
        // Just close the notification, nothing else
        return;
    }

    // For 'answer', 'view', or default click: navigate to the conversation
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Try to find an existing window and navigate it
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
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
