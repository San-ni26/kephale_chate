'use client';

import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { toast } from 'sonner';
import { usePathname, useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/src/lib/auth-client';

export function NotificationListener() {
    const pathname = usePathname();
    const router = useRouter();
    const { userChannel, isConnected } = useWebSocket();
    const pushRegistered = useRef(false);

    const pathnameRef = useRef(pathname);
    const routerRef = useRef(router);
    pathnameRef.current = pathname;
    routerRef.current = router;

    // Listen for in-app notifications via Pusher
    useEffect(() => {
        if (!userChannel || !isConnected) return;

        const handleNewNotification = (data: {
            id: string;
            content: string;
            messageId: string;
            conversationId: string;
            senderName: string;
            createdAt: string;
        }) => {
            console.log('[Notification] Received:', data.senderName);

            const currentPath = pathnameRef.current;
            if (currentPath?.includes(`/chat/discussion/${data.conversationId}`)) return;

            toast(data.senderName, {
                description: data.content,
                action: {
                    label: 'Voir',
                    onClick: () => routerRef.current.push(`/chat/discussion/${data.conversationId}`)
                },
                duration: 5000,
            });

            // Also try to show a native browser notification (for when tab is not focused)
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                try {
                    new Notification(data.senderName, {
                        body: data.content,
                        icon: '/icons/icon-192x192.png',
                        tag: 'msg-' + data.conversationId,
                    });
                } catch (e) {
                    // Silently fail - native notifications may not work in all contexts
                }
            }
        };

        const handleIncomingCall = (data: {
            callerId: string;
            callerName?: string;
            offer: any;
            conversationId: string;
        }) => {
            const currentPath = pathnameRef.current;
            if (currentPath?.includes(`/chat/discussion/${data.conversationId}`)) return;

            const callerDisplay = data.callerName || 'Quelqu\'un';

            toast(`Appel de ${callerDisplay}`, {
                description: 'Cliquez pour repondre',
                action: {
                    label: 'Repondre',
                    onClick: () => routerRef.current.push(`/chat/discussion/${data.conversationId}`)
                },
                duration: 30000,
            });

            // Native notification for call
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                try {
                    new Notification(`Appel de ${callerDisplay}`, {
                        body: 'Appuyez pour repondre',
                        icon: '/icons/icon-192x192.png',
                        tag: 'call-' + data.conversationId,
                        requireInteraction: true,
                    });
                } catch (e) {}
            }
        };

        userChannel.bind('notification:new', handleNewNotification);
        userChannel.bind('call:incoming', handleIncomingCall);

        return () => {
            userChannel.unbind('notification:new', handleNewNotification);
            userChannel.unbind('call:incoming', handleIncomingCall);
        };
    }, [userChannel, isConnected]);

    // Register Web Push + request permission
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (pushRegistered.current) return;

        const registerPush = async () => {
            // Step 1: Check browser support
            const hasSW = 'serviceWorker' in navigator;
            const hasPush = 'PushManager' in window;
            const hasNotif = typeof Notification !== 'undefined';

            console.log('[Push] Support check - SW:', hasSW, 'Push:', hasPush, 'Notification:', hasNotif);

            if (!hasNotif) {
                console.warn('[Push] Notifications API not available (Safari needs PWA installed on Home Screen)');
                return;
            }

            // Step 2: Request permission
            let permission = Notification.permission;
            console.log('[Push] Current permission:', permission);

            if (permission === 'default') {
                try {
                    permission = await Notification.requestPermission();
                    console.log('[Push] Permission after request:', permission);
                } catch (e) {
                    console.error('[Push] Permission request failed:', e);
                    return;
                }
            }

            if (permission !== 'granted') {
                console.warn('[Push] Permission denied by user');
                return;
            }

            // Step 3: Register push subscription if SW + Push are available
            if (!hasSW || !hasPush) {
                console.log('[Push] SW/Push not available, using in-app notifications only');
                return;
            }

            try {
                // Wait for SW to be ready
                const registration = await navigator.serviceWorker.ready;
                console.log('[Push] SW ready:', registration.active?.scriptURL);

                // Get or create subscription
                let subscription = await registration.pushManager.getSubscription();

                if (!subscription) {
                    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                    if (!vapidKey) {
                        console.error('[Push] Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY');
                        return;
                    }

                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(vapidKey),
                    });
                    console.log('[Push] New subscription created');
                } else {
                    console.log('[Push] Existing subscription found');
                }

                // Step 4: Send to server with auth
                const subJson = subscription.toJSON();
                const res = await fetchWithAuth('/api/push/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subscription: {
                            endpoint: subJson.endpoint,
                            keys: subJson.keys,
                        }
                    }),
                });

                if (res.ok) {
                    console.log('[Push] Subscription saved to server');
                    pushRegistered.current = true;
                } else {
                    console.error('[Push] Server save failed:', res.status);
                }
            } catch (error) {
                console.error('[Push] Registration error:', error);
            }
        };

        // Delay to ensure everything is loaded
        const timeout = setTimeout(registerPush, 2000);
        return () => clearTimeout(timeout);
    }, []);

    return null;
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
