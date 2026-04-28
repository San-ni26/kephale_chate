'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { toast } from 'sonner';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, isProtectedPath } from '@/src/lib/auth-client';
import { registerPushSubscription, syncPushSubscriptionIfGranted } from '@/src/lib/register-push-client';

/**
 * Vérifie si les notifications push sont supportées (pas sur Safari iOS)
 */
const isPushSupported = (): boolean => {
    return typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        // Safari iOS ne supporte pas les notifications push
        !(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream);
};

/**
 * Envoie la route actuelle au Service Worker.
 * Le SW l'utilise pour supprimer le push si l'utilisateur est déjà sur la page.
 * Envoi à chaque changement de route ET au retour de visibilité.
 */
function usePushSkipPathname(pathname: string | null) {
    const lastSent = useRef<string | null>(null);

    const sendPath = useCallback((p: string) => {
        if (!p || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        navigator.serviceWorker.ready.then((reg) => {
            if (reg.active) {
                reg.active.postMessage({ type: 'PUSH_SKIP_PATH', pathname: p });
            }
        }).catch(() => { });
    }, []);

    useEffect(() => {
        if (!pathname) return;
        if (lastSent.current !== pathname) {
            lastSent.current = pathname;
            sendPath(pathname);
        }
    }, [pathname, sendPath]);

    useEffect(() => {
        const onVisible = () => {
            if (pathname && document.visibilityState === 'visible') {
                lastSent.current = pathname;
                sendPath(pathname);
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [pathname, sendPath]);
}

/**
 * NotificationListener
 *
 * Écoute les notifications en temps réel via Pusher (canal privé utilisateur).
 * Affiche uniquement un toast Sonner in-app — le push natif est géré exclusivement
 * par le Service Worker (sw.js) pour éviter les doubles notifications.
 *
 * ── Corrections appliquées ──────────────────────────────────────────────────
 * FIX 1 — Double notification :
 *   Suppression de `new Notification()` dans ce fichier. Le SW reçoit le push
 *   via VAPID et s'occupe de l'affichage. Garder les deux créait systématiquement
 *   une notification dupliquée.
 *
 * FIX 2 — Notification quand l'utilisateur est dans la discussion :
 *   - Côté client : vérification robuste via pathnameRef (toujours à jour)
 *   - Côté SW     : la logique `pathnameByClientId` (PUSH_SKIP_PATH) est maintenant
 *                   envoyée immédiatement et au retour de visibilité.
 *   - Côté serveur : `notifyNewMessage` dans websocket.ts vérifie l'API Pusher
 *                   pour savoir si le destinataire est abonné au channel de
 *                   la conversation → skip du push Web si oui.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function NotificationListener() {
    const pathname = usePathname();
    const router = useRouter();
    const { userChannel, isConnected } = useWebSocket();
    const pushRegistered = useRef(false);

    usePushSkipPathname(pathname);

    const pathnameRef = useRef(pathname);
    const routerRef = useRef(router);
    pathnameRef.current = pathname;
    routerRef.current = router;

    // ── Écoute Pusher in-app ──────────────────────────────────────────────
    useEffect(() => {
        if (!userChannel || !isConnected) {
            console.log('[NotificationListener] Pusher not ready:', { hasUserChannel: !!userChannel, isConnected });
            return;
        }

        console.log('[NotificationListener] Binding to notification:new on channel:', userChannel.name);

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
            console.log('[NotificationListener] Received notification:new:', data);
            
            const currentPath = pathnameRef.current;
            const isOnNotificationsPage = currentPath?.startsWith('/chat/notifications') ?? false;

            // ── Discussion privée ──
            if (data.conversationId) {
                const discussionMatch = currentPath?.match(/^\/chat\/discussion\/([^/?]+)/);
                const currentConvId = discussionMatch?.[1];
                // Skip si l'utilisateur est déjà dans cette discussion ou sur /notifications
                if ((currentConvId && currentConvId === data.conversationId) || isOnNotificationsPage) {
                    console.log('[NotificationListener] Skipping toast - user is in current discussion or notifications page');
                    return;
                }

                // FIX 1 : Uniquement le toast Sonner — PAS de new Notification()
                // Le push natif est envoyé par le serveur via VAPID → handled by sw.js
                toast(data.senderName ?? 'Nouveau message', {
                    description: data.content,
                    action: {
                        label: 'Voir',
                        onClick: () => routerRef.current.push(`/chat/discussion/${data.conversationId}`)
                    },
                    duration: 5000,
                });
                return;
            }

            // ── Groupe de collaboration ──
            if (data.type === 'collaboration_message' || (data.orgId && data.collabId && data.groupId && !data.deptId)) {
                const { orgId: notifOrgId, collabId: notifCollabId, groupId: notifGroupId } = data;
                if (!notifOrgId || !notifCollabId || !notifGroupId) return;

                const collabChatMatch = currentPath?.match(/^\/chat\/organizations\/([^/]+)\/collaborations\/([^/]+)\/groups\/([^/]+)\/chat/);
                if (collabChatMatch) {
                    const [, cOrgId, cCollabId, cGroupId] = collabChatMatch;
                    const inThisChat = cOrgId === notifOrgId && cCollabId === notifCollabId && cGroupId === notifGroupId;
                    if (inThisChat || isOnNotificationsPage) return;
                }

                const collabChatPath = `/chat/organizations/${notifOrgId}/collaborations/${notifCollabId}/groups/${notifGroupId}/chat`;
                // FIX 1 : toast uniquement, pas de new Notification()
                toast(data.senderName ?? 'Nouveau message', {
                    description: data.content,
                    action: { label: 'Voir', onClick: () => routerRef.current.push(collabChatPath) },
                    duration: 5000,
                });
                return;
            }

            // ── Département ──
            if (data.type === 'department_message' || (data.orgId && data.deptId)) {
                const { orgId: notifOrgId, deptId: notifDeptId } = data;
                if (!notifOrgId || !notifDeptId) return;

                const deptChatMatch = currentPath?.match(/^\/chat\/organizations\/([^/]+)\/departments\/([^/]+)\/chat/);
                if (deptChatMatch) {
                    const [, cOrgId, cDeptId] = deptChatMatch;
                    const inThisDeptChat = cOrgId === notifOrgId && cDeptId === notifDeptId;
                    if (inThisDeptChat || isOnNotificationsPage) return;
                }

                const deptChatPath = `/chat/organizations/${notifOrgId}/departments/${notifDeptId}/chat`;
                // FIX 1 : toast uniquement, pas de new Notification()
                toast('Discussion département', {
                    description: data.content,
                    action: { label: 'Voir', onClick: () => routerRef.current.push(deptChatPath) },
                    duration: 5000,
                });
                return;
            }

            // ── Notifications génériques ──
            if (data.content) {
                const groupId = data.groupId;
                toast(data.senderName ?? 'Notification', {
                    description: data.content,
                    ...(groupId && {
                        action: { label: 'Voir', onClick: () => routerRef.current.push(`/chat/groups?groupId=${groupId}`) },
                    }),
                    duration: 5000,
                });
            }
        };

        userChannel.bind('notification:new', handleNewNotification);
        console.log('[NotificationListener] Écoute Pusher active sur', userChannel.name);

        return () => {
            console.log('[NotificationListener] Unbinding from notification:new');
            userChannel.unbind('notification:new', handleNewNotification);
        };
    }, [userChannel, isConnected]);

    // ── Enregistrement Web Push initial ──────────────────────────────────
    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        // Ne pas essayer d'enregistrer les push sur Safari iOS (non supporté)
        if (!isPushSupported()) {
            if (process.env.NODE_ENV === 'development') {
                console.log('[NotificationListener] Push not supported on this device (iOS Safari)');
            }
            return;
        }
        
        if (!pathname || !isProtectedPath(pathname) || !getToken()) {
            // Réinitialiser si on n'est plus sur une route protégée (logout)
            pushRegistered.current = false;
            return;
        }

        // Si déjà enregistré, ne pas re-enregistrer sauf si on change de route protégée
        if (pushRegistered.current) return;

        const run = async () => {
            console.log('[NotificationListener] Registering push subscription...');
            const result = await registerPushSubscription();
            if (result.ok) {
                pushRegistered.current = true;
                console.log('[NotificationListener] Push subscription registered successfully');
            } else {
                console.error('[NotificationListener] Push registration failed:', result.error);
            }
        };
        const timeout = setTimeout(run, 500);
        return () => clearTimeout(timeout);
    }, [pathname]);

    // ── Re-synchroniser l'abonnement push au retour sur l'app ────────────
    useEffect(() => {
        if (typeof document === 'undefined') return;
        
        // Ne pas essayer sur Safari iOS
        if (!isPushSupported()) return;

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
