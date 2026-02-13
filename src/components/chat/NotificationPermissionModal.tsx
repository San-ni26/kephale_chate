'use client';

import { useState, useEffect } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import {
    registerPushSubscription,
    canAskPushPermission,
    getNotificationPermission,
} from '@/src/lib/register-push-client';
import { toast } from 'sonner';

const MODAL_DISMISSED_KEY = 'kephale-push-modal-dismissed';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 heures

export function NotificationPermissionModal() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted || typeof window === 'undefined') return;

        const perm = getNotificationPermission();
        if (perm === 'granted') return;
        if (!canAskPushPermission()) return;

        const dismissedAt = localStorage.getItem(MODAL_DISMISSED_KEY);
        if (dismissedAt) {
            const elapsed = Date.now() - parseInt(dismissedAt, 10);
            if (elapsed < DISMISS_DURATION_MS) return;
        }

        // Petit délai pour que la page soit chargée
        const timer = setTimeout(() => setOpen(true), 800);
        return () => clearTimeout(timer);
    }, [mounted]);

    const handleActivate = async () => {
        setLoading(true);
        try {
            const result = await registerPushSubscription();
            if (result.ok) {
                setOpen(false);
                toast.success('Notifications activées. Vous recevrez des alertes même quand l\'app est fermée.');
            } else {
                toast.error(result.error || 'Impossible d\'activer les notifications');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLater = () => {
        localStorage.setItem(MODAL_DISMISSED_KEY, Date.now().toString());
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
            <DialogContent showCloseButton={false} className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex justify-center mb-2">
                        <div className="bg-primary/10 w-14 h-14 rounded-full flex items-center justify-center">
                            <Bell className="w-7 h-7 text-primary" />
                        </div>
                    </div>
                    <DialogTitle className="text-center">
                        Activer les notifications
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        Recevez vos messages et appels en temps réel, <strong>même lorsque l&apos;application est fermée</strong>.
                        Restez connecté sans garder le chat ouvert.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-col gap-2 sm:flex-col mt-4">
                    <Button
                        onClick={handleActivate}
                        disabled={loading}
                        className="w-full"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Activation…
                            </>
                        ) : (
                            <>
                                <Bell className="mr-2 h-4 w-4" />
                                Activer les notifications
                            </>
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={handleLater}
                        disabled={loading}
                        className="w-full text-muted-foreground"
                    >
                        Plus tard
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
