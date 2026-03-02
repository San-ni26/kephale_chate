'use client';

import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { toast } from 'sonner';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, isProtectedPath } from '@/src/lib/auth-client';
import { registerPushSubscription, syncPushSubscriptionIfGranted } from '@/src/lib/register-push-client';

/**
 * Écoute les notifications (messages, etc.) via Pusher.
 * Les appels entrants sont gérés uniquement par CallContext + GlobalCallOverlay
 * pour éviter doublons et conflits - l'utilisateur peut répondre depuis n'importe quelle page.
 */
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
            messageId?: string;
            conversationId?: string;
            senderName?: string;
            createdAt: string;
            orgId?: string;
            collabId?: string;
            deptId?: string;
            groupId?: string;
            type?: string;
        }) => {
            const currentPath = pathnameRef.current;

            // Ne pas notifier si l'utilisateur est déjà dans la conversation ou sur la page notifications
            const isOnNotificationsPage = currentPath?.startsWith('/chat/notifications') ?? false;
            const shouldSkip = (inConversation: boolean) => inConversation || isOnNotificationsPage;

            // Groupe de collaboration : ne pas notifier si l'utilisateur est déjà dans ce chat (et onglet actif)
            if (data.type === 'collaboration_message' || (data.orgId && data.collabId && data.groupId && !data.deptId)) {
                const notifOrgId = data.orgId;
                const notifCollabId = data.collabId;
                const notifGroupId = data.groupId;
                const collabChatMatch = currentPath?.match(/^\/chat\/organizations\/([^/]+)\/collaborations\/([^/]+)\/groups\/([^/]+)\/chat/);
                if (collabChatMatch) {
                    const [, currentOrgId, currentCollabId, currentGroupId] = collabChatMatch;
                    const inThisChat = !!(notifOrgId && notifCollabId && notifGroupId && currentOrgId === notifOrgId && currentCollabId === notifCollabId && currentGroupId === notifGroupId);
                    if (shouldSkip(inThisChat)) return;
                }
                if (!notifOrgId || !notifCollabId || !notifGroupId) return;
                const collabChatPath = `/chat/organizations/${notifOrgId}/collaborations/${notifCollabId}/groups/${notifGroupId}/chat`;
                if (process.env.NODE_ENV === 'development') {
                    console.log('[Notification] Received (collaboration):', data.content);
                }
                toast(data.senderName ?? 'Nouveau message', {
                    description: data.content,
                    action: {
                        label: 'Voir',
                        onClick: () => routerRef.current.push(collabChatPath)
                    },
                    duration: 5000,
                });
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    try {
                        new Notification(data.senderName ?? 'Nouveau message', {
                            body: data.content,
                            icon: '/icons/icon-192x192.png',
                            tag: 'collab-' + data.groupId,
                        });
                    } catch (e) { }
                }
                return;
            }

            // Discussion privée : ne pas notifier si l'utilisateur est déjà dans cette conversation ou sur la page notifications
            if (data.conversationId) {
                const discussionMatch = currentPath?.match(/^\/chat\/discussion\/([^/?]+)/);
                const currentConvId = discussionMatch?.[1];
                const inThisDiscussion = !!currentConvId && currentConvId === data.conversationId;
                if (inThisDiscussion || isOnNotificationsPage) return;
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

            // Discussion département : ne pas notifier si l'utilisateur est déjà dans le chat du département (et onglet actif)
            if (data.type === 'department_message' || (data.orgId && data.deptId)) {
                const notifOrgId = data.orgId;
                const notifDeptId = data.deptId;
                const deptChatMatch = currentPath?.match(/^\/chat\/organizations\/([^/]+)\/departments\/([^/]+)\/chat/);
                if (deptChatMatch) {
                    const [, currentOrgId, currentDeptId] = deptChatMatch;
                    const inThisDeptChat = !!(notifOrgId && notifDeptId && currentOrgId === notifOrgId && currentDeptId === notifDeptId);
                    if (shouldSkip(inThisDeptChat)) return;
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

        userChannel.bind('notification:new', handleNewNotification);
        if (process.env.NODE_ENV === 'development') {
            console.log('[Notification] Écoute Pusher active (notification:new)');
        }

        return () => {
            userChannel.unbind('notification:new', handleNewNotification);
        };
    }, [userChannel, isConnected]);

    // Enregistrement Web Push initial (uniquement si utilisateur authentifié)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (pushRegistered.current) return;
        if (!pathname || !isProtectedPath(pathname) || !getToken()) return;

        const run = async () => {
            const result = await registerPushSubscription();
            if (result.ok) pushRegistered.current = true;
        };
        const timeout = setTimeout(run, 500);
        return () => clearTimeout(timeout);
    }, [pathname]);

    // Re-synchroniser l'abonnement push au retour sur l'app (uniquement si authentifié)
    useEffect(() => {
        if (typeof document === 'undefined') return;

        const onVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            if (!getToken()) return;
            syncPushSubscriptionIfGranted().then((ok) => {
                if (ok) pushRegistered.current = true;
            });
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    return null;
}
