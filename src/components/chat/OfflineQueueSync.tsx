'use client';

import { useEffect, useRef } from 'react';
import { useSWRConfig } from 'swr';
import { useRouter } from 'next/navigation';
import { processQueue } from '@/src/lib/offline-queue';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { toast } from 'sonner';

/**
 * Traite la file d'attente des messages hors ligne au retour en ligne.
 * Écoute aussi les messages du SW (Background Sync) pour invalider le cache.
 */
export function OfflineQueueSync() {
    const isOnline = useOnlineStatus();
    const { mutate } = useSWRConfig();
    const router = useRouter();
    const processedRef = useRef(false);

    useEffect(() => {
        if (!isOnline) {
            processedRef.current = false;
            return;
        }

        const run = async () => {
            if (processedRef.current) return;
            processedRef.current = true;

            try {
                const { sent, failed } = await processQueue();
                if (sent > 0) {
                    toast.success(`${sent} message(s) envoyé(s)`);
                    mutate(() => true);
                    router.refresh();
                }
                if (failed > 0 && sent === 0) {
                    toast.error('Échec de l\'envoi des messages en attente');
                }
            } catch {
                processedRef.current = false;
            } finally {
                processedRef.current = false;
            }
        };

        run();
    }, [isOnline, mutate, router]);

    // Écouter les messages du SW (Background Sync a envoyé)
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        const onMessage = (e: MessageEvent) => {
            if (e.data?.type === 'QUEUE_ITEM_SENT') {
                mutate(() => true);
                router.refresh();
            }
        };

        navigator.serviceWorker.addEventListener('message', onMessage);
        return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }, [mutate, router]);

    return null;
}
