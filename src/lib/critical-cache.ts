/**
 * Cache API pour données critiques de l'application.
 * Plus fiable qu'IndexedDB sur iOS sous pression mémoire.
 * Supporte TTL (Time To Live) pour invalidation automatique.
 */

const CRITICAL_CACHE_NAME = 'mango-critical-v1';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * Stocke des données critiques dans le Cache API
 * @param key - Clé unique pour les données
 * @param data - Données à stocker (doit être sérialisable en JSON)
 * @param ttlMs - Durée de vie en millisecondes (défaut: 24h)
 */
export async function cacheCriticalData<T>(
    key: string,
    data: T,
    ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) {
        return;
    }

    try {
        const cache = await caches.open(CRITICAL_CACHE_NAME);
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl: ttlMs,
        };

        const response = new Response(JSON.stringify(entry), {
            headers: {
                'Content-Type': 'application/json',
                'X-Cached-At': new Date().toISOString(),
            },
        });

        await cache.put(`/${key}`, response);
    } catch (error) {
        console.error('[CriticalCache] Failed to cache data:', error);
    }
}

/**
 * Récupère des données depuis le Cache API
 * @param key - Clé des données
 * @returns Les données si trouvées et valides, null sinon
 */
export async function getCriticalData<T>(key: string): Promise<T | null> {
    if (typeof window === 'undefined' || !('caches' in window)) {
        return null;
    }

    try {
        const cache = await caches.open(CRITICAL_CACHE_NAME);
        const response = await cache.match(`/${key}`);

        if (!response) {
            return null;
        }

        const entry: CacheEntry<T> = await response.json();

        // Vérifier si les données sont encore valides (TTL)
        const age = Date.now() - entry.timestamp;
        if (age > entry.ttl) {
            // Données expirées, les supprimer
            await cache.delete(`/${key}`);
            return null;
        }

        return entry.data;
    } catch (error) {
        console.error('[CriticalCache] Failed to get data:', error);
        return null;
    }
}

/**
 * Supprime des données spécifiques du cache
 * @param key - Clé des données à supprimer
 */
export async function removeCriticalData(key: string): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) {
        return;
    }

    try {
        const cache = await caches.open(CRITICAL_CACHE_NAME);
        await cache.delete(`/${key}`);
    } catch (error) {
        console.error('[CriticalCache] Failed to remove data:', error);
    }
}

/**
 * Vide entièrement le cache critique
 * Utile lors de la déconnexion
 */
export async function clearCriticalCache(): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) {
        return;
    }

    try {
        await caches.delete(CRITICAL_CACHE_NAME);
    } catch (error) {
        console.error('[CriticalCache] Failed to clear cache:', error);
    }
}

/**
 * Liste toutes les clés présentes dans le cache
 * @returns Liste des clés (sans le / préfixe)
 */
export async function listCachedKeys(): Promise<string[]> {
    if (typeof window === 'undefined' || !('caches' in window)) {
        return [];
    }

    try {
        const cache = await caches.open(CRITICAL_CACHE_NAME);
        const requests = await cache.keys();
        return requests.map(req => req.url.replace(self.location.origin + '/', ''));
    } catch (error) {
        console.error('[CriticalCache] Failed to list keys:', error);
        return [];
    }
}

/**
 * Vérifie si une entrée existe et est valide
 * @param key - Clé à vérifier
 * @returns true si l'entrée existe et n'est pas expirée
 */
export async function hasValidCache(key: string): Promise<boolean> {
    if (typeof window === 'undefined' || !('caches' in window)) {
        return false;
    }

    try {
        const cache = await caches.open(CRITICAL_CACHE_NAME);
        const response = await cache.match(`/${key}`);

        if (!response) {
            return false;
        }

        const entry: CacheEntry<unknown> = await response.json();
        const age = Date.now() - entry.timestamp;
        
        if (age > entry.ttl) {
            await cache.delete(`/${key}`);
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

// Clés prédéfinies pour les données critiques de l'app
export const CRITICAL_KEYS = {
    USER_PROFILE: 'user-profile',
    CONVERSATIONS_LIST: 'conversations-list',
    LAST_SYNC: 'last-sync',
    ORGANIZATIONS: 'organizations',
    DEPARTMENTS: 'departments',
} as const;
