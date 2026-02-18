'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Button } from '@/src/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/card';
import { Bell, X, Smartphone, Trash2, Loader2 } from 'lucide-react';
import { registerPushSubscription, canAskPushPermission, getNotificationPermission, getCurrentPushEndpoint } from '@/src/lib/register-push-client';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { fetcher } from '@/src/lib/fetcher';
import { toast } from 'sonner';

const BANNER_DISMISSED_KEY = 'kephale-push-banner-dismissed';

type PushStatus = { vapidConfigured: boolean; subscriptionCount: number; message?: string } | null;

type PushDevice = {
    id: string;
    endpoint: string;
    deviceName: string | null;
    createdAt: string;
};

type EnablePushBannerProps = {
    variant?: 'banner' | 'settings';
};

export function EnablePushBanner({ variant = 'banner' }: EnablePushBannerProps) {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission | null>(null);
    const [showTestRow, setShowTestRow] = useState(false);
    const [pushStatus, setPushStatus] = useState<PushStatus>(null);
    const [needsResubscribe, setNeedsResubscribe] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);

    const { data: devicesData, error: devicesError, mutate: mutateDevices, isLoading: devicesLoading } = useSWR<{ devices: PushDevice[] }>(
        variant === 'settings' ? '/api/push/subscriptions' : null,
        fetcher,
        { revalidateOnFocus: true, dedupingInterval: 5000 }
    );
    const devices = Array.isArray(devicesData?.devices) ? devicesData.devices : [];

    useEffect(() => {
        if (variant === 'settings') {
            getCurrentPushEndpoint().then(setCurrentEndpoint);
        }
    }, [variant]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const perm = getNotificationPermission();
        setPermission(perm);
        const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
        if (variant === 'settings') {
            setVisible(true);
            if (perm === 'granted') setShowTestRow(true);
        } else {
            if (dismissed === '1' && perm !== 'granted') setVisible(false);
            else if (canAskPushPermission() && perm !== 'granted') setVisible(true);
            else if (perm === 'granted') setShowTestRow(true);
        }
    }, [variant]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const shouldFetch = permission === 'granted' || variant === 'settings';
        if (!shouldFetch) return;
        let cancelled = false;
        fetchWithAuth('/api/push/status', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: PushStatus) => {
                if (!cancelled && data) {
                    setPushStatus(data);
                    if (permission === 'granted' && data.subscriptionCount === 0) {
                        setShowTestRow(false);
                        setVisible(true);
                        setNeedsResubscribe(true);
                    }
                }
            })
            .catch(() => { });
        return () => { cancelled = true; };
    }, [permission, variant]);

    const handleEnable = async () => {
        setLoading(true);
        try {
            const result = await registerPushSubscription(needsResubscribe);
            if (result.ok) {
                setPermission('granted');
                setVisible(false);
                setShowTestRow(true);
                setNeedsResubscribe(false);
                fetchWithAuth('/api/push/status', { credentials: 'include' })
                    .then((res) => (res.ok ? res.json() : null))
                    .then((data: PushStatus) => data && setPushStatus(data))
                    .catch(() => { });
                if (variant === 'settings') mutateDevices();
                toast.success('Notifications activées.');
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
                toast.success('Notification test envoyée.');
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

    const handleDeleteDevice = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetchWithAuth(`/api/push/subscriptions/${id}`, { method: 'DELETE' });
            if (res.ok) {
                mutateDevices();
                fetchWithAuth('/api/push/status', { credentials: 'include' })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((data: PushStatus) => data && setPushStatus(data))
                    .catch(() => { });
                toast.success('Appareil supprimé');
            } else {
                const data = await res.json();
                toast.error(data.error || 'Erreur lors de la suppression');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setDeletingId(null);
        }
    };

    if (pushStatus && !pushStatus.vapidConfigured && permission === 'granted' && variant !== 'settings') {
        return null;
    }

    if (variant === 'settings') {
        return (
            <Card className="bg-card border-border">
                <CardHeader>
                    <CardTitle className="text-sm uppercase text-muted-foreground font-bold flex items-center gap-2">
                        <Bell className="w-4 h-4" />
                        Notifications
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Bloc activation / test */}
                    {showTestRow && permission === 'granted' ? (
                        <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                                Recevez les messages et appels même quand l&apos;app est fermée.
                            </p>

                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                                Recevez les messages et appels même quand l&apos;app est fermée.
                            </p>
                            <Button
                                size="sm"
                                variant="default"
                                onClick={handleEnable}
                                disabled={loading}
                            >
                                {loading ? 'Activation…' : 'Activer les notifications'}
                            </Button>
                        </div>
                    )}

                    {/* Section Appareils enregistrés - TOUJOURS visible en mode paramètres */}
                    <div className="space-y-2 pt-2 border-t border-border">
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                            Appareils enregistrés {!devicesLoading && `(${devices.length})`}
                        </p>
                        {devicesLoading ? (
                            <div className="flex items-center gap-2 p-4 rounded-lg bg-muted/50 border border-border">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Chargement des appareils…</span>
                            </div>
                        ) : devicesError ? (
                            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                                <p className="text-sm text-destructive mb-2">Erreur lors du chargement des appareils.</p>
                                <Button size="sm" variant="outline" onClick={() => mutateDevices()}>
                                    Réessayer
                                </Button>
                            </div>
                        ) : devices.length === 0 ? (
                            <div className="p-4 rounded-lg bg-muted/50 border border-border">
                                <p className="text-sm text-muted-foreground">{'Aucun appareil enregistré. Cliquez sur "Activer les notifications" pour en ajouter un.'}</p>
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {devices.map((device) => {
                                    const isCurrentDevice = currentEndpoint && device.endpoint === currentEndpoint;
                                    const displayName = device.deviceName || 'Appareil';
                                    return (
                                    <li
                                        key={device.id}
                                        className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50 border border-border"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Smartphone className="w-4 h-4 shrink-0 text-muted-foreground" />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-medium text-foreground">
                                                        {displayName}
                                                    </p>
                                                    {isCurrentDevice && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                                                            Cet appareil
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Enregistré le{' '}
                                                    {new Date(device.createdAt).toLocaleDateString('fr-FR', {
                                                        day: 'numeric',
                                                        month: 'long',
                                                        year: 'numeric',
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDeleteDevice(device.id)}
                                            disabled={deletingId === device.id}
                                            aria-label="Supprimer cet appareil"
                                        >
                                            {deletingId === device.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </Button>
                                    </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (showTestRow && permission === 'granted') {
        return null;
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
