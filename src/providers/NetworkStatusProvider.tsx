'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useNetworkStatus, NetworkStatus } from '@/src/hooks/useNetworkStatus';

/**
 * Context pour partager l'état réseau dans toute l'application
 * Évite d'avoir plusieurs hooks useNetworkStatus dans différents composants
 */
const NetworkStatusContext = createContext<NetworkStatus | null>(null);

/**
 * Provider qui wrap l'application et fournit l'état réseau
 * 
 * @example
 * // Dans layout.tsx
 * <NetworkStatusProvider>
 *   {children}
 * </NetworkStatusProvider>
 * 
 * // Dans un composant
 * const { online, quality, saveData } = useNetworkStatusContext();
 */
export function NetworkStatusProvider({ children }: { children: ReactNode }) {
    const status = useNetworkStatus();
    
    return (
        <NetworkStatusContext.Provider value={status}>
            {children}
        </NetworkStatusContext.Provider>
    );
}

/**
 * Hook pour accéder au contexte réseau
 * Doit être utilisé à l'intérieur de NetworkStatusProvider
 */
export function useNetworkStatusContext(): NetworkStatus {
    const context = useContext(NetworkStatusContext);
    if (!context) {
        throw new Error(
            'useNetworkStatusContext must be used within a NetworkStatusProvider'
        );
    }
    return context;
}

/**
 * Hook utilitaire pour vérifier rapidement si on est hors ligne
 * Plus simple que useNetworkStatusContext() quand seul le statut online est nécessaire
 */
export function useIsOffline(): boolean {
    const context = useContext(NetworkStatusContext);
    if (!context) {
        throw new Error(
            'useIsOffline must be used within a NetworkStatusProvider'
        );
    }
    return !context.online;
}
