'use client';

import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { toast } from 'sonner';
import { usePathname, useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { registerPushSubscription, syncPushSubscriptionIfGranted } from '@/src/lib/register-push-client';
import { useCallContext } from '@/src/contexts/CallContext';

const PENDING_CALL_KEY = 'pendingIncomingCall';

export function NotificationListener() {
    const pathname = usePathname();
    const router = useRouter();
    const { userChannel, isConnected } = useWebSocket();
    const pushRegistered = useRef(false);
    const callContext = useCallContext();

    const pathnameRef = useRef(pathname);
    const routerRef = useRef(router);
    const isInCallRef = useRef(false);
    pathnameRef.current = pathname;
    routerRef.current = router;
    isInCallRef.current = callContext?.isInCall ?? false;

    // Listen for in-app notifications via Pusher
    useEffect(() => {
        if (!userChannel || !isConnected) return;

        const handleNewNotification = (data: {
            id: string;
            content: string;
            messageId?: string;
            conversationId?: string;
            senderName?: string;
            createdAt: string;
            orgId?: string;
            deptId?: string;
            groupId?: string;
            type?: string;
        }) => {
            const currentPath = pathnameRef.current;

            // Discussion privée : ne pas notifier si l'utilisateur est déjà dans cette conversation
            if (data.conversationId) {
                if (currentPath?.includes(`/chat/discussion/${data.conversationId}`)) return;
                if (process.env.NODE_ENV === 'development') {
                    console.log('[Notification] Received:', data.senderName);
                }
                toast(data.senderName ?? 'Nouveau message', {
                    description: data.content,
                    action: {
                        label: 'Voir',
                        onClick: () => routerRef.current.push(`/chat/discussion/${data.conversationId}`)
                    },
                    duration: 5000,
                });
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    try {
                        new Notification(data.senderName ?? 'Nouveau message', {
                            body: data.content,
                            icon: '/icons/icon-192x192.png',
                            tag: 'msg-' + data.conversationId,
                        });
                    } catch (e) { }
                }
                return;
            }

            // Discussion département : ne pas notifier si l'utilisateur est déjà dans le chat du département
            if (data.type === 'department_message' || (data.orgId && data.deptId)) {
                const notifOrgId = data.orgId;
                const notifDeptId = data.deptId;
                // Si on est sur une page chat département, extraire org/dept de l'URL pour comparer
                const deptChatMatch = currentPath?.match(/^\/chat\/organizations\/([^/]+)\/departments\/([^/]+)\/chat/);
                if (deptChatMatch) {
                    const [, currentOrgId, currentDeptId] = deptChatMatch;
                    if (notifOrgId && notifDeptId && currentOrgId === notifOrgId && currentDeptId === notifDeptId) return;
                    // type department_message sans orgId/deptId dans le payload : ne pas afficher si on est sur un chat dept
                    if (data.type === 'department_message' && !notifOrgId && !notifDeptId) return;
                }
                if (!notifOrgId || !notifDeptId) return; // pas de lien "Voir" possible
                if (process.env.NODE_ENV === 'development') {
                    console.log('[Notification] Received (département):', data.content);
                }
                const deptChatPath = `/chat/organizations/${notifOrgId}/departments/${notifDeptId}/chat`;
                toast('Discussion département', {
                    description: data.content,
                    action: {
                        label: 'Voir',
                        onClick: () => routerRef.current.push(deptChatPath)
                    },
                    duration: 5000,
                });
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    try {
                        new Notification('Discussion département', {
                            body: data.content,
                            icon: '/icons/icon-192x192.png',
                            tag: 'dept-' + data.deptId,
                        });
                    } catch (e) { }
                }
                return;
            }

            // Notifications génériques (ex: partage de note)
            if (data.content) {
                const groupId = data.groupId;
                toast(data.senderName ?? 'Notification', {
                    description: data.content,
                    ...(groupId && {
                        action: {
                            label: 'Voir',
                            onClick: () => routerRef.current.push(`/chat/groups?groupId=${groupId}`),
                        },
                    }),
                    duration: 5000,
                });
            }
        };

        const handleIncomingCall = (data: {
            callerId: string;
            callerName?: string;
            offer: any;
            conversationId: string;
        }) => {
            if (isInCallRef.current) return;
            const currentPath = pathnameRef.current;
            if (currentPath?.includes(`/chat/discussion/${data.conversationId}`)) return;

            const callerDisplay = data.callerName || 'Quelqu\'un';

            const rejectCall = async () => {
                try {
                    await fetchWithAuth('/api/call/signal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ event: 'call:reject', callerId: data.callerId }),
                    });
                    sessionStorage.removeItem(PENDING_CALL_KEY);
                } catch (e) {
                    console.error('[Call] Reject failed:', e);
                }
            };

            const answerCall = () => {
                try {
                    sessionStorage.setItem(PENDING_CALL_KEY, JSON.stringify(data));
                    routerRef.current.push(`/chat/discussion/${data.conversationId}`);
                } catch (e) {
                    console.error('[Call] Navigate failed:', e);
                }
            };

            toast(`Appel de ${callerDisplay}`, {
                description: 'Cliquez pour repondre ou raccrocher',
                action: {
                    label: 'Repondre',
                    onClick: answerCall,
                },
                cancel: {
                    label: 'Raccrocher',
                    onClick: rejectCall,
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
                } catch (e) { }
            }
        };

        userChannel.bind('notification:new', handleNewNotification);
        userChannel.bind('call:incoming', handleIncomingCall);
        if (process.env.NODE_ENV === 'development') {
            console.log('[Notification] Écoute Pusher active (notification:new, call:incoming)');
        }

        return () => {
            userChannel.unbind('notification:new', handleNewNotification);
            userChannel.unbind('call:incoming', handleIncomingCall);
        };
    }, [userChannel, isConnected, callContext]);

    // Enregistrement Web Push initial (dès que possible après chargement)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (pushRegistered.current) return;

        const run = async () => {
            const result = await registerPushSubscription();
            if (result.ok) pushRegistered.current = true;
        };
        const timeout = setTimeout(run, 1500);
        return () => clearTimeout(timeout);
    }, []);

    // Re-synchroniser l'abonnement push au retour sur l'app (notifications même app fermée)
    useEffect(() => {
        if (typeof document === 'undefined') return;

        const onVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            syncPushSubscriptionIfGranted().then((ok) => {
                if (ok) pushRegistered.current = true;
            });
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    return null;
}
