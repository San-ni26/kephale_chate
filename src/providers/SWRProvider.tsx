'use client';

import { SWRConfig } from 'swr';
import { fetcher, OfflineError } from '@/src/lib/fetcher';

/**
 * Configuration SWR globale pour performance et robustesse :
 * - Retry automatique sur erreur réseau (sauf 401/403 et hors ligne)
 * - Deduplication des requêtes
 * - Revalidation à la reconnexion
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
    return (
        <SWRConfig
            value={{
                fetcher,
                revalidateOnFocus: false,
                revalidateOnReconnect: true,
                dedupingInterval: 5000,
                errorRetryCount: 3,
                errorRetryInterval: 5000,
                shouldRetryOnError: (error) => {
                    if (error instanceof OfflineError) return false;
                    const err = error as Error & { status?: number };
                    return err?.status !== 401 && err?.status !== 403;
                },
                onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
                    if (error instanceof OfflineError || retryCount >= 3) return;
                    setTimeout(() => revalidate({ retryCount }), 5000);
                },
            }}
        >
            {children}
        </SWRConfig>
    );
}
