'use client';

import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { toast } from 'sonner';
import { usePathname, useRouter } from 'next/navigation';

export function NotificationListener() {
    const pathname = usePathname();
    const router = useRouter();
    const { socket, isConnected } = useWebSocket();

    // Use refs for pathname/router so the socket listener always has latest values
    const pathnameRef = useRef(pathname);
    const routerRef = useRef(router);
    pathnameRef.current = pathname;
    routerRef.current = router;

    // Listen for in-app notifications
    useEffect(() => {
        if (!socket || !isConnected) return;

        const handleNewNotification = (data: {
            id: string;
            content: string;
            messageId: string;
            conversationId: string;
            senderName: string;
            createdAt: Date;
        }) => {
            console.log('Received notification:new event', data);

            // Check if user is currently viewing the conversation
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

        // Listen for incoming call notifications (global - works on any page)
        const handleIncomingCall = (data: {
            callerId: string;
            callerName?: string;
            offer: any;
            conversationId: string;
        }) => {
            const currentPath = pathnameRef.current;
            // Only show toast if NOT already on the conversation page (page handles it directly)
            const isOnConversation = currentPath?.includes(`/chat/discussion/${data.conversationId}`);
            if (isOnConversation) return;

            const callerDisplay = data.callerName || 'Quelqu\'un';

            toast(`Appel entrant de ${callerDisplay}`, {
                description: 'Cliquez pour répondre',
                action: {
                    label: 'Répondre',
                    onClick: () => routerRef.current.push(`/chat/discussion/${data.conversationId}`)
                },
                duration: 30000,
            });
        };

        socket.on('notification:new', handleNewNotification);
        socket.on('call:incoming', handleIncomingCall);

        return () => {
            socket.off('notification:new', handleNewNotification);
            socket.off('call:incoming', handleIncomingCall);
        };
    }, [socket, isConnected]);

    // Register Push Notifications
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Service Worker or PushManager not supported in this browser');
            return;
        }

        const registerPush = async () => {
            try {
                console.log('Initializing Push Notification registration...');

                // Check permission
                let permission = Notification.permission;
                console.log('Current notification permission:', permission);

                if (permission === 'default') {
                    permission = await Notification.requestPermission();
                    console.log('Notification permission requested, result:', permission);
                }

                if (permission !== 'granted') {
                    console.warn('Notification permission rejected');
                    return;
                }

                const registration = await navigator.serviceWorker.ready;
                console.log('Service Worker ready');

                // Check if already subscribed
                let subscription = await registration.pushManager.getSubscription();

                if (!subscription) {
                    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                    if (!publicKey) {
                        console.error('VAPID Public Key missing in environment variables');
                        return;
                    }

                    console.log('Subscribing to PushManager...');

                    try {
                        subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array(publicKey)
                        });
                        console.log('New push subscription created');
                    } catch (subError) {
                        console.error('Failed to subscribe to PushManager:', subError);
                        return;
                    }
                }

                // Send subscription to server
                console.log('Sending subscription to server...');
                const res = await fetch('/api/push/subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ subscription }),
                });

                if (!res.ok) {
                    console.error('Failed to save subscription on server:', await res.text());
                } else {
                    console.log('Push subscription successfully saved on server');
                }
            } catch (error) {
                console.error('Service Worker / Push Error:', error);
            }
        };

        registerPush();
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
