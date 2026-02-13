'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Bell, X, Send } from 'lucide-react';
import { registerPushSubscription, canAskPushPermission, getNotificationPermission } from '@/src/lib/register-push-client';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';

const BANNER_DISMISSED_KEY = 'kephale-push-banner-dismissed';

export function EnablePushBanner() {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission | null>(null);
    const [showTestRow, setShowTestRow] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const perm = getNotificationPermission();
        setPermission(perm);
        const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
        if (dismissed === '1' && perm !== 'granted') setVisible(false);
        else if (canAskPushPermission() && perm !== 'granted') setVisible(true);
        else if (perm === 'granted') setShowTestRow(true);
    }, []);

    const handleEnable = async () => {
        setLoading(true);
        try {
            const result = await registerPushSubscription();
            if (result.ok) {
                setPermission('granted');
                setVisible(false);
                setShowTestRow(true);
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

    // Ligne "Notifications activées" + bouton Test (quand déjà activé)
    if (showTestRow && permission === 'granted') {
        return (
            <div className="bg-green-500/10 border-b border-green-500/20 px-3 py-1.5 flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                    <Bell className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="text-foreground truncate">Notifications activées (app fermée incluse)</span>
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
