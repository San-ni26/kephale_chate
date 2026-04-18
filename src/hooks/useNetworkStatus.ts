'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Types pour Network Information API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API
 */
interface NetworkInformation {
    type: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
    effectiveType: '2g' | '3g' | '4g' | 'slow-2g';
    downlink: number;
    downlinkMax?: number;
    rtt: number;
    saveData: boolean;
    addEventListener: (type: string, listener: EventListener) => void;
    removeEventListener: (type: string, listener: EventListener) => void;
}

interface NavigatorWithConnection extends Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
}

export interface NetworkStatus {
    /** L'utilisateur est-il en ligne */
    online: boolean;
    /** Type de connexion (wifi, cellular, etc.) */
    type: NetworkInformation['type'] | 'unknown';
    /** Type effectif pour la performance (4g, 3g, 2g, slow-2g) */
    effectiveType: NetworkInformation['effectiveType'] | 'unknown';
    /** Vitesse de téléchargement estimée en Mbps */
    downlink: number;
    /** Latence estimée en ms */
    rtt: number;
    /** Mode économie de données activé */
    saveData: boolean;
    /** API supportée par le navigateur */
    supported: boolean;
    /** Qualité de connexion déduite */
    quality: 'excellent' | 'good' | 'fair' | 'poor' | 'offline' | 'unknown';
}

/**
 * Détermine la qualité de connexion basée sur effectiveType et online status
 */
function getConnectionQuality(
    online: boolean,
    effectiveType: NetworkInformation['effectiveType'] | 'unknown'
): NetworkStatus['quality'] {
    if (!online) return 'offline';
    
    switch (effectiveType) {
        case '4g':
            return 'excellent';
        case '3g':
            return 'good';
        case '2g':
            return 'fair';
        case 'slow-2g':
            return 'poor';
        default:
            return 'unknown';
    }
}

/**
 * Hook pour détecter le statut réseau avancé.
 * Utilise navigator.onLine + Network Information API quand disponible.
 * 
 * @example
 * const { online, effectiveType, quality, saveData } = useNetworkStatus();
 * 
 * // Afficher un warning si connexion lente
 * if (quality === 'poor') {
 *   toast.warning('Connexion lente - les images peuvent mettre du temps à charger');
 * }
 */
export function useNetworkStatus(): NetworkStatus {
    const [status, setStatus] = useState<NetworkStatus>({
        online: true,
        type: 'unknown',
        effectiveType: 'unknown',
        downlink: 0,
        rtt: 0,
        saveData: false,
        supported: false,
        quality: 'unknown',
    });

    const getConnection = useCallback((): NetworkInformation | undefined => {
        if (typeof window === 'undefined') return undefined;
        const nav = navigator as NavigatorWithConnection;
        return nav.connection || nav.mozConnection || nav.webkitConnection;
    }, []);

    const updateStatus = useCallback(() => {
        if (typeof window === 'undefined') return;

        const online = navigator.onLine;
        const connection = getConnection();

        if (connection) {
            setStatus({
                online,
                type: connection.type || 'unknown',
                effectiveType: connection.effectiveType || 'unknown',
                downlink: connection.downlink || 0,
                rtt: connection.rtt || 0,
                saveData: connection.saveData || false,
                supported: true,
                quality: getConnectionQuality(online, connection.effectiveType),
            });
        } else {
            // Fallback basique si Network Information API non supportée
            setStatus({
                online,
                type: 'unknown',
                effectiveType: 'unknown',
                downlink: 0,
                rtt: 0,
                saveData: false,
                supported: false,
                quality: online ? 'unknown' : 'offline',
            });
        }
    }, [getConnection]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // État initial
        updateStatus();

        // Écouteurs online/offline
        const handleOnline = () => {
            updateStatus();
        };

        const handleOffline = () => {
            updateStatus();
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Écouteur Network Information API
        const connection = getConnection();
        if (connection) {
            connection.addEventListener('change', updateStatus);
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (connection) {
                connection.removeEventListener('change', updateStatus);
            }
        };
    }, [updateStatus, getConnection]);

    return status;
}

/**
 * Hook utilitaire pour vérifier rapidement si on est en ligne
 * Version optimisée si seul le statut online est nécessaire
 */
export function useIsOnline(): boolean {
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
