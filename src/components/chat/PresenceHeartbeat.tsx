'use client';

/**
 * Envoie un heartbeat périodique pour maintenir le statut "en ligne" dans Redis.
 * Quand l'app est fermée ou en arrière-plan, le TTL Redis (60s) marque l'utilisateur offline.
 * Compatible Vercel - fonctionne avec Upstash Redis.
 */

import { useEffect, useRef } from 'react';
import { getUser, fetchWithAuth } from '@/src/lib/auth-client';

const HEARTBEAT_INTERVAL_MS = 25_000; // 25 secondes (TTL Redis = 60s)

export function PresenceHeartbeat() {
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user) return;

        const sendHeartbeat = async (offline = false) => {
            try {
                await fetchWithAuth('/api/presence', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(offline ? { offline: true } : {}),
                });
            } catch {
                // Silencieux - le TTL Redis gérera l'offline
            }
        };

        // Premier heartbeat immédiat
        sendHeartbeat();

        // Heartbeat périodique
        intervalRef.current = setInterval(() => sendHeartbeat(), HEARTBEAT_INTERVAL_MS);

        // Marquer offline quand la page est cachée (onglet switch, minimize)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                sendHeartbeat(true);
            } else if (document.visibilityState === 'visible') {
                sendHeartbeat(); // Re-online immédiat
            }
        };

        // Marquer offline à la fermeture (navigateur, refresh)
        const handlePageUnload = () => {
            sendHeartbeat(true);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageUnload);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageUnload);
            sendHeartbeat(true);
        };
    }, []);

    return null;
}
