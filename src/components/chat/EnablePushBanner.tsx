'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Bell, X } from 'lucide-react';
import { registerPushSubscription, canAskPushPermission, getNotificationPermission } from '@/src/lib/register-push-client';
import { toast } from 'sonner';

const BANNER_DISMISSED_KEY = 'kephale-push-banner-dismissed';

export function EnablePushBanner() {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setPermission(getNotificationPermission());
        const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
        if (dismissed === '1') setVisible(false);
        else if (canAskPushPermission() && getNotificationPermission() !== 'granted') setVisible(true);
    }, []);

    const handleEnable = async () => {
        setLoading(true);
        try {
            const result = await registerPushSubscription();
            if (result.ok) {
                setPermission('granted');
                setVisible(false);
                toast.success('Notifications activées. Vous recevrez des alertes même quand l\'app est fermée.');
            } else {
                toast.error(result.error || 'Impossible d\'activer les notifications');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDismiss = () => {
        setVisible(false);
        sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
    };

    if (!visible || permission === 'granted') return null;

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
