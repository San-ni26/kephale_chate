'use client';

/**
 * Enregistrement de l'abonnement Web Push côté client.
 * Utilisé pour recevoir les notifications même quand l'app est fermée.
 */

import { fetchWithAuth } from '@/src/lib/auth-client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export interface RegisterPushResult {
    ok: boolean;
    error?: string;
}

/** Dérive un nom lisible pour l'appareil à partir du navigateur */
export function getDeviceName(): string {
    if (typeof navigator === 'undefined') return 'Appareil';
    const ua = navigator.userAgent;
    const platform = navigator.platform || '';
    if (/iPhone|iPod/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) {
        if (/Mobile/i.test(ua)) return 'Android (téléphone)';
        return 'Android (tablette)';
    }
    if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return 'Mac';
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'PC Windows';
    if (/Linux/i.test(platform)) return 'Linux';
    if (/CrOS/i.test(ua)) return 'Chromebook';
    return 'Appareil';
}

/**
 * Demande la permission, crée l'abonnement push et l'envoie au serveur.
 * À appeler après un geste utilisateur (bouton) pour de meilleurs résultats sur certains navigateurs.
 * @param forceResubscribe - Si true, desabonne puis re-souscrit (utile apres VapidPkHashMismatch)
 */
export async function registerPushSubscription(forceResubscribe = false): Promise<RegisterPushResult> {
    if (typeof window === 'undefined') {
        return { ok: false, error: 'Côté serveur' };
    }
    if (!('Notification' in window)) {
        return { ok: false, error: 'Notifications non supportées' };
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return { ok: false, error: 'Push non supporté (utilisez Chrome/Firefox ou installez l\'app)' };
    }

    let permission = Notification.permission;
    if (permission === 'default') {
        try {
            permission = await Notification.requestPermission();
        } catch (e) {
            return { ok: false, error: 'Permission refusée' };
        }
    }
    if (permission !== 'granted') {
        return { ok: false, error: 'Autorisez les notifications dans les paramètres du navigateur' };
    }

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
        return { ok: false, error: 'Push non configuré (VAPID manquant)' };
    }

    try {
        let registration = await navigator.serviceWorker.getRegistration('/');
        if (!registration) {
            registration = await navigator.serviceWorker.register('/sw.js', {
                updateViaCache: 'none',
                scope: '/',
            });
        }
        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        if (!registration.active) {
            const sw = registration.installing || registration.waiting;
            if (sw) {
                await new Promise<void>((resolve) => {
                    const onStateChange = () => {
                        if (sw.state === 'activated') {
                            sw.removeEventListener('statechange', onStateChange);
                            resolve();
                        }
                    };
                    sw.addEventListener('statechange', onStateChange);
                    if (sw.state === 'activated') resolve();
                });
            } else {
                await navigator.serviceWorker.ready;
            }
        }
        if (!registration.active) {
            return { ok: false, error: 'Service Worker non prêt. Réessayez.' };
        }

        let subscription = await registration.pushManager.getSubscription();
        if (forceResubscribe && subscription) {
            await subscription.unsubscribe();
            subscription = null;
        }
        if (!subscription) {
            const keyBytes = urlBase64ToUint8Array(vapidKey);
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                // Cast pour compatibilité TypeScript (PushManager attend BufferSource)
                applicationServerKey: keyBytes as unknown as BufferSource,
            });
        }

        const subJson = subscription.toJSON();
        const deviceName = getDeviceName();
        const res = await fetchWithAuth('/api/push/subscribe', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: {
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                },
                deviceName,
            }),
        });

        if (res.ok) {
            return { ok: true };
        }
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: (err as { error?: string }).error || `Erreur ${res.status}` };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erreur inconnue';
        return { ok: false, error: message };
    }
}

/** Indique si les notifications navigateur sont possibles (permission + support). */
export function canAskPushPermission(): boolean {
    if (typeof window === 'undefined') return false;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window))
        return false;
    return true;
}

/** Permission actuelle (default | granted | denied). */
export function getNotificationPermission(): NotificationPermission | null {
    if (typeof window === 'undefined' || !('Notification' in window)) return null;
    return Notification.permission;
}

/** Récupère l'endpoint de l'abonnement push actuel (pour identifier l'appareil courant). */
export async function getCurrentPushEndpoint(): Promise<string | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = await reg?.pushManager?.getSubscription();
        return sub?.endpoint ?? null;
    } catch {
        return null;
    }
}

/**
 * Re-synchronise l'abonnement push avec le serveur sans redemander la permission.
 * À appeler au retour sur l'app (ex: visibilitychange) pour garder les notifications actives quand l'app est fermée.
 */
export async function syncPushSubscriptionIfGranted(): Promise<boolean> {
    if (typeof window === 'undefined' || !canAskPushPermission()) return false;
    if (Notification.permission !== 'granted') return false;
    const result = await registerPushSubscription();
    return result.ok;
}
