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

    // Use refs for pathname/router so listeners always have latest values
    const pathnameRef = useRef(pathname);
    const routerRef = useRef(router);
    pathnameRef.current = pathname;
    routerRef.current = router;

    // Listen for in-app notifications on the user's private Pusher channel
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
            console.log('[NotificationListener] Received notification:new event', data);

            const currentPath = pathnameRef.current;
            const isViewingConversation =
                currentPath?.includes(`/chat/discussion/${data.conversationId}`) ||
                currentPath?.includes(`/chat/groups/${data.conversationId}`);

            if (isViewingConversation) {
                return;
            }

            toast(data.senderName, {
                description: data.content,
                action: {
                    label: 'Voir',
                    onClick: () => routerRef.current.push(`/chat/discussion/${data.conversationId}`)
                },
                duration: 5000,
            });
        };

        const handleIncomingCall = (data: {
            callerId: string;
            callerName?: string;
            offer: any;
            conversationId: string;
        }) => {
            const currentPath = pathnameRef.current;
            const isOnConversation = currentPath?.includes(`/chat/discussion/${data.conversationId}`);
            if (isOnConversation) return;

            const callerDisplay = data.callerName || 'Quelqu\'un';

            toast(`Appel entrant de ${callerDisplay}`, {
                description: 'Cliquez pour repondre',
                action: {
                    label: 'Repondre',
                    onClick: () => routerRef.current.push(`/chat/discussion/${data.conversationId}`)
                },
                duration: 30000,
            });
        };

        userChannel.bind('notification:new', handleNewNotification);
        userChannel.bind('call:incoming', handleIncomingCall);

        return () => {
            userChannel.unbind('notification:new', handleNewNotification);
            userChannel.unbind('call:incoming', handleIncomingCall);
        };
    }, [userChannel, isConnected]);

    // Register Push Notifications - uses fetchWithAuth for authentication
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Service Worker or PushManager not supported in this browser');
            return;
        }

        const registerPush = async () => {
            try {
                console.log('[Push] Initializing Push Notification registration...');

                let permission = Notification.permission;
                console.log('[Push] Current notification permission:', permission);

                if (permission === 'default') {
                    permission = await Notification.requestPermission();
                    console.log('[Push] Notification permission requested, result:', permission);
                }

                if (permission !== 'granted') {
                    console.warn('[Push] Notification permission rejected');
                    return;
                }

                const registration = await navigator.serviceWorker.ready;
                console.log('[Push] Service Worker ready');

                let subscription = await registration.pushManager.getSubscription();

                if (!subscription) {
                    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                    if (!publicKey) {
                        console.error('[Push] VAPID Public Key missing in environment variables');
                        return;
                    }

                    console.log('[Push] Subscribing to PushManager...');

                    try {
                        subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array(publicKey)
                        });
                        console.log('[Push] New push subscription created');
                    } catch (subError) {
                        console.error('[Push] Failed to subscribe to PushManager:', subError);
                        return;
                    }
                }

                console.log('[Push] Sending subscription to server...');

                // CRITICAL: Use fetchWithAuth to include JWT token
                // Without auth, the server can't associate this subscription with a user
                const res = await fetchWithAuth('/api/push/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subscription: subscription.toJSON() }),
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    console.error('[Push] Failed to save subscription on server:', errorText);
                } else {
                    console.log('[Push] Push subscription successfully saved on server');
                }
            } catch (error) {
                console.error('[Push] Service Worker / Push Error:', error);
            }
        };

        // Small delay to ensure auth token is available after login
        const timeout = setTimeout(registerPush, 2000);
        return () => clearTimeout(timeout);
    }, []);

    return null;
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
