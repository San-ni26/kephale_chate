'use client';

import { useEffect } from 'react';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { toast } from 'sonner';
import { usePathname, useRouter } from 'next/navigation';

export function NotificationListener() {
    const pathname = usePathname();
    const router = useRouter();
    const { socket } = useWebSocket();

    useEffect(() => {
        if (!socket) return;

        const handleNewNotification = (data: {
            id: string;
            content: string;
            messageId: string;
            conversationId: string;
            senderName: string;
            createdAt: Date;
        }) => {
            // Check if user is currently viewing the conversation
            // Assuming chat URL pattern is /chat/discussion/[id] or similar
            // Also handle groups if different URL

            const isViewingConversation = pathname?.includes(`/chat/discussion/${data.conversationId}`) ||
                pathname?.includes(`/chat/groups/${data.conversationId}`);

            if (isViewingConversation) {
                return;
            }

            toast(data.senderName, {
                description: data.content,
                action: {
                    label: 'Voir',
                    onClick: () => router.push(`/chat/discussion/${data.conversationId}`)
                },
                duration: 5000,
            });
        };

        socket.on('notification:new', handleNewNotification);

        return () => {
            socket.off('notification:new', handleNewNotification);
        };
    }, [socket, pathname, router]);

    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            const registerPush = async () => {
                try {
                    // Check logic for permission
                    let permission = Notification.permission;
                    if (permission === 'default') {
                        permission = await Notification.requestPermission();
                    }

                    if (permission !== 'granted') {
                        console.log('Notification permission rejected');
                        return;
                    }

                    const registration = await navigator.serviceWorker.ready;

                    // Check if already subscribed
                    let subscription = await registration.pushManager.getSubscription();
                    console.log('Existing subscription:', subscription);

                    if (!subscription) {
                        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                        if (!publicKey) {
                            console.error('VAPID Public Key missing');
                            return;
                        }

                        subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array(publicKey)
                        });
                        console.log('New subscription created:', subscription);
                    }

                    // Send subscription to server
                    const res = await fetch('/api/push/subscribe', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ subscription }),
                    });

                    if (!res.ok) {
                        console.error('Failed to save subscription on server', await res.text());
                    } else {
                        console.log('Push subscription saved on server');
                    }

                } catch (error) {
                    console.error('Service Worker / Push Error:', error);
                }
            };

            registerPush();
        }
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
