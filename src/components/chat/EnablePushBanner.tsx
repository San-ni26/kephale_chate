'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Bell, X, Send, AlertCircle } from 'lucide-react';
import { registerPushSubscription, canAskPushPermission, getNotificationPermission } from '@/src/lib/register-push-client';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';

const BANNER_DISMISSED_KEY = 'kephale-push-banner-dismissed';

type PushStatus = { vapidConfigured: boolean; subscriptionCount: number; message?: string } | null;

export function EnablePushBanner() {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission | null>(null);
    const [showTestRow, setShowTestRow] = useState(false);
    const [pushStatus, setPushStatus] = useState<PushStatus>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const perm = getNotificationPermission();
        setPermission(perm);
        const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
        if (dismissed === '1' && perm !== 'granted') setVisible(false);
        else if (canAskPushPermission() && perm !== 'granted') setVisible(true);
        else if (perm === 'granted') setShowTestRow(true);
    }, []);

    // Diagnostic : récupérer le statut push (VAPID + nombre d'appareils)
    useEffect(() => {
        if (typeof window === 'undefined' || permission !== 'granted') return;
        let cancelled = false;
        fetchWithAuth('/api/push/status', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: PushStatus) => {
                if (!cancelled && data) {
                    setPushStatus(data);
                    // Si permission accordée mais 0 appareil, afficher le bandeau "Activer"
                    if (data.subscriptionCount === 0) {
                        setShowTestRow(false);
                        setVisible(true);
                    }
                }
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [permission]);

    const handleEnable = async () => {
        setLoading(true);
        try {
            const result = await registerPushSubscription();
            if (result.ok) {
                setPermission('granted');
                setVisible(false);
                setShowTestRow(true);
                // Rafraîchir le statut pour afficher le nombre d'appareils
                fetchWithAuth('/api/push/status', { credentials: 'include' })
                    .then((res) => (res.ok ? res.json() : null))
                    .then((data: PushStatus) => data && setPushStatus(data))
                    .catch(() => {});
                toast.success('Notifications activées. Vous recevrez des alertes même quand l\'app est fermée.');
            } else {
                toast.error(result.error || 'Impossible d\'activer les notifications');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleTest = async () => {
        setTestLoading(true);
        try {
            const res = await fetchWithAuth('/api/push/test', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                toast.success('Notification test envoyée. Elle doit s\'afficher (même si l\'app est fermée).');
            } else {
                toast.error(data.error || data.hint || 'Échec du test');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setTestLoading(false);
        }
    };

    const handleDismiss = () => {
        setVisible(false);
        sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
    };

    // Avertissement si VAPID non configuré côté serveur
    if (pushStatus && !pushStatus.vapidConfigured && permission === 'granted') {
        return (
            <div className="bg-amber-500/20 border-b border-amber-500/30 px-3 py-2 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">
                    Notifications non configurées sur le serveur (clés VAPID manquantes). Les alertes ne seront pas envoyées.
                </span>
            </div>
        );
    }

    // Ligne "Notifications activées" + bouton Test (quand déjà activé et au moins 1 appareil)
    if (showTestRow && permission === 'granted') {
        return (
            <div className="bg-green-500/10 border-b border-green-500/20 px-3 py-1.5 flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                    <Bell className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="text-foreground truncate">
                        Notifications activées ({pushStatus?.subscriptionCount ?? '?'} appareil(s), app fermée incluse)
                    </span>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleTest} disabled={testLoading}>
                    <Send className="w-3 h-3 mr-1" />
                    {testLoading ? 'Envoi…' : 'Test'}
                </Button>
            </div>
        );
    }

    if (!visible) return null;

    return (
        <div className="bg-primary/10 border-b border-primary/20 px-3 py-2 flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
                <Bell className="w-4 h-4 shrink-0 text-primary" />
                <span className="text-foreground truncate">
                    Recevez les messages et appels même quand l&apos;app est fermée.
                </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <Button
                    size="sm"
                    variant="default"
                    className="h-8 text-xs"
                    onClick={handleEnable}
                    disabled={loading}
                >
                    {loading ? 'Activation…' : 'Activer'}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={handleDismiss}
                    aria-label="Fermer"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
