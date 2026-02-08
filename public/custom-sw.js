
self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: data.icon || '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: '2',
                url: data.url || '/'
            }
        };
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
                // Check if user has a window open and focused on the conversation
                // The data.url typically contains the conversation path
                const urlToOpen = data.url || '/';

                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    // If client is focused and on the same URL path (or close enough)
                    if (client.focused && 'url' in client && client.url.includes(urlToOpen)) {
                        // User is looking at the conversation, no need for notification
                        return;
                    }
                }

                return self.registration.showNotification(data.title, options);
            })
        );
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return clients.openWindow(event.notification.data.url || '/');
        })
    );
});
