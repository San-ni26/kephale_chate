'use client';

import { useState, useEffect } from 'react';

/**
 * Hook pour détecter le statut de connexion réseau.
 * Utilise navigator.onLine + écoute des événements online/offline.
 * Initialement true pour éviter le mismatch d'hydratation (serveur n'a pas navigator).
 */
export function useOnlineStatus(): boolean {
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        setIsOnline(navigator.onLine);

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
}
