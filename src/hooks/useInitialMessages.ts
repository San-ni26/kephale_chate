'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { createCacheAwareFetcher } from '@/src/lib/api-cache';

export interface Message {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
    updatedAt: string;
    isEdited: boolean;
    attachments?: { filename: string; type: string; data: string }[];
    sender: { id: string; name: string; email: string; publicKey: string };
}

export function useInitialMessages(conversationId: string | null) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        if (!conversationId) return;

        setLoading(true);
        setMessages([]);
        setHasMore(true);

        const url = `/api/conversations/${conversationId}/messages?limit=50`;

        // Function to perform a direct network fetch
        const networkFetch = async (u: string) => {
            const res = await fetchWithAuth(u);
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                const msg = (errBody as { error?: string })?.error || `Erreur ${res.status}`;
                throw new Error(msg);
            }
            return res.json();
        };

        // Cache-aware fetcher for fallback (or future use if needed)
        const cacheFetcher = createCacheAwareFetcher(networkFetch);

        const load = async () => {
            try {
                // Attempt network fetch first
                const data = await networkFetch(url);
                setMessages(data.messages ?? []);
                setHasMore(data.hasMore !== false);
            } catch (networkError) {
                console.warn('Network fetch failed, attempting to load from cache...', networkError);
                toast.warning('Erreur réseau, tentative de chargement depuis le cache...');
                try {
                    // If network fails, try fetching from cache (cacheFetcher will try cache first)
                    const data = await cacheFetcher(url);
                    setMessages(data.messages ?? []);
                    setHasMore(data.hasMore !== false);
                    toast.info('Messages chargés depuis le cache.');
                } catch (cacheError) {
                    console.error('Failed to load messages from network and cache', cacheError);
                    toast.error('Erreur de chargement des messages (réseau et cache)');
                }
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [conversationId]);

    return { messages, setMessages, loading, hasMore, setHasMore };
}
