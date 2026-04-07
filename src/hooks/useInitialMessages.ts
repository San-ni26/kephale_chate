'use client';

import { useState, useEffect, useRef } from 'react';
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
    attachments?: { id?: string; filename: string; type: string; data?: string; url?: string; storageKey?: string }[];
    sender: { id: string; name: string; email: string; publicKey: string };
}

const CACHE_KEY_PREFIX = 'messages_cache_';

function getCachedMessages(conversationId: string): { messages: Message[]; hasMore: boolean } | null {
    try {
        const raw = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${conversationId}`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function setCachedMessages(conversationId: string, messages: Message[], hasMore: boolean) {
    try {
        sessionStorage.setItem(`${CACHE_KEY_PREFIX}${conversationId}`, JSON.stringify({ messages, hasMore }));
    } catch { /* sessionStorage full — ignore */ }
}

export function useInitialMessages(conversationId: string | null) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const prevConversationId = useRef<string | null>(null);

    useEffect(() => {
        if (!conversationId) return;

        const isNewConversation = prevConversationId.current !== conversationId;
        prevConversationId.current = conversationId;

        // Try loading from cache first for instant display
        const cached = getCachedMessages(conversationId);
        if (cached && isNewConversation) {
            setMessages(cached.messages);
            setHasMore(cached.hasMore);
            setLoading(false);
            setRefreshing(true);
        } else if (isNewConversation) {
            setLoading(true);
            setMessages([]);
            setHasMore(true);
        }

        const url = `/api/conversations/${conversationId}/messages?limit=50`;

        const networkFetch = async (u: string) => {
            const res = await fetchWithAuth(u);
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                const msg = (errBody as { error?: string })?.error || `Erreur ${res.status}`;
                throw new Error(msg);
            }
            return res.json();
        };

        const cacheFetcher = createCacheAwareFetcher(networkFetch);

        const load = async () => {
            try {
                const data = await networkFetch(url);
                const msgs = data.messages ?? [];
                const more = data.hasMore !== false;
                setMessages(msgs);
                setHasMore(more);
                setCachedMessages(conversationId, msgs, more);
            } catch (networkError) {
                console.warn('Network fetch failed, attempting to load from cache...', networkError);
                // Only show toast + fallback if we don't already have cached data displayed
                if (!cached) {
                    toast.warning('Erreur réseau, tentative de chargement depuis le cache...');
                    try {
                        const data = await cacheFetcher(url);
                        setMessages(data.messages ?? []);
                        setHasMore(data.hasMore !== false);
                        toast.info('Messages chargés depuis le cache.');
                    } catch (cacheError) {
                        console.error('Failed to load messages from network and cache', cacheError);
                        toast.error('Erreur de chargement des messages (réseau et cache)');
                    }
                }
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        };

        load();
    }, [conversationId]);

    return { messages, setMessages, loading, hasMore, setHasMore, refreshing };
}
