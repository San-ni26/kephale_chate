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
            console.log('[Notification] Received notification:new', data);

            const currentPath = pathnameRef.current;
            const isViewingConversation =
                currentPath?.includes(`/chat/discussion/${data.conversationId}`) ||
                currentPath?.includes(`/chat/groups/${data.conversationId}`);

            if (isViewingConversation) return;

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

    // Register Web Push Notifications
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (pushRegistered.current) return; // Only register once
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('[Push] Not supported in this browser');
            return;
        }

        const registerPush = async () => {
            try {
                console.log('[Push] Starting registration...');

                // Request notification permission
                let permission = Notification.permission;
                if (permission === 'default') {
                    permission = await Notification.requestPermission();
                }
                console.log('[Push] Permission:', permission);

                if (permission !== 'granted') {
                    console.warn('[Push] Permission denied');
                    return;
                }

                // Wait for ANY service worker to be ready
                // This will be either next-pwa's sw.js or our custom-sw.js
                const registration = await navigator.serviceWorker.ready;
                console.log('[Push] Service Worker ready, scope:', registration.scope);
                console.log('[Push] Active SW:', registration.active?.scriptURL);

                // Check existing subscription
                let subscription = await registration.pushManager.getSubscription();
                console.log('[Push] Existing subscription:', !!subscription);

                if (!subscription) {
                    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                    if (!publicKey) {
                        console.error('[Push] VAPID Public Key missing');
                        return;
                    }

                    console.log('[Push] Creating new subscription...');
                    try {
                        subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array(publicKey),
                        });
                        console.log('[Push] New subscription created:', subscription.endpoint.substring(0, 60) + '...');
                    } catch (subError: any) {
                        console.error('[Push] Subscribe failed:', subError.message);
                        return;
                    }
                }

                // Send subscription to server WITH authentication
                console.log('[Push] Saving subscription to server...');
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
                    console.log('[Push] Subscription saved successfully!');
                    pushRegistered.current = true;
                } else {
                    const errText = await res.text();
                    console.error('[Push] Failed to save subscription:', res.status, errText);
                }
            } catch (error) {
                console.error('[Push] Registration error:', error);
            }
        };

        // Delay to ensure auth token is available
        const timeout = setTimeout(registerPush, 3000);
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
