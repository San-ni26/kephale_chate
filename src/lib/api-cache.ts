'use client';

/**
 * Cache API transparent - aucune différence de logique pour les composants.
 * Le fetcher retourne le cache si disponible (instantané), sinon fetch.
 * Sur revalidation SWR, on fetch pour avoir des données fraîches.
 */

const API_CACHE_NAME = 'kephale-v1-api';

const cacheServedKeys = new Set<string>();

export async function getCachedApiResponse<T = unknown>(url: string): Promise<T | null> {
    if (typeof caches === 'undefined' || typeof location === 'undefined') return null;

    try {
        const cache = await caches.open(API_CACHE_NAME);
        const fullUrl = url.startsWith('http') ? url : `${location.origin}${url}`;
        const request = new Request(fullUrl, { method: 'GET' });
        const cached = await cache.match(request);
        if (!cached || !cached.ok) return null;

        const data = await cached.json();
        return data as T;
    } catch {
        return null;
    }
}

/**
 * Ajoute ou met à jour un message dans le cache (appelé à chaque nouveau message reçu ou envoyé).
 */
export async function addMessageToCache(
    url: string,
    message: { id: string }
): Promise<void> {
    if (typeof caches === 'undefined' || typeof location === 'undefined') return;

    try {
        const cache = await caches.open(API_CACHE_NAME);
        const fullUrl = url.startsWith('http') ? url : `${location.origin}${url}`;
        const request = new Request(fullUrl, { method: 'GET' });
        const cached = await cache.match(request);
        if (!cached || !cached.ok) return;

        const data = (await cached.json()) as { messages?: Array<{ id?: string }>; hasMore?: boolean; conversationId?: string; pinnedEvents?: unknown[] };
        const messages = data.messages ?? [];
        const idx = messages.findIndex((m) => m?.id === message.id);
        if (idx >= 0) {
            messages[idx] = message;
        } else {
            messages.push(message);
        }
        const updated = { ...data, messages };
        const response = new Response(JSON.stringify(updated), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
        await cache.put(request, response);
    } catch {
        // Ignorer les erreurs de mise à jour du cache
    }
}

/**
 * Retire un message du cache (appelé à la suppression).
 */
export async function removeMessageFromCache(url: string, messageId: string): Promise<void> {
    if (typeof caches === 'undefined' || typeof location === 'undefined') return;

    try {
        const cache = await caches.open(API_CACHE_NAME);
        const fullUrl = url.startsWith('http') ? url : `${location.origin}${url}`;
        const request = new Request(fullUrl, { method: 'GET' });
        const cached = await cache.match(request);
        if (!cached || !cached.ok) return;

        const data = (await cached.json()) as { messages?: Array<{ id?: string }>; hasMore?: boolean; conversationId?: string; pinnedEvents?: unknown[] };
        const messages = (data.messages ?? []).filter((m) => m?.id !== messageId);
        const updated = { ...data, messages };
        const response = new Response(JSON.stringify(updated), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
        await cache.put(request, response);
    } catch {
        // Ignorer
    }
}

/**
 * Wrapper fetcher transparent : retourne le cache si dispo (rapide), sinon fetch.
 * Sur revalidation, fetch pour données fraîches. La logique des composants ne change pas.
 */
export function createCacheAwareFetcher<T>(
    fetcher: (url: string) => Promise<T>
): (url: string) => Promise<T> {
    return async (url: string): Promise<T> => {
        if (cacheServedKeys.has(url)) {
            cacheServedKeys.delete(url);
            return fetcher(url);
        }
        const cached = await getCachedApiResponse<T>(url);
        if (cached != null) {
            cacheServedKeys.add(url);
            return cached;
        }
        return fetcher(url);
    };
}
