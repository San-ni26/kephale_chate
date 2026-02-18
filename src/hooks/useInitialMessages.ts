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

        const url = `/api/conversations/${conversationId}/messages?limit=30`;
        const msgFetcher = createCacheAwareFetcher(async (u: string) => {
            const res = await fetchWithAuth(u);
            if (!res.ok) throw new Error('Failed to fetch');
            return res.json();
        });

        const load = async () => {
            try {
                const data = await msgFetcher(url);
                setMessages(data.messages ?? []);
                setHasMore(data.hasMore !== false);
            } catch (error) {
                console.error('Failed to load messages', error);
                toast.error('Erreur de chargement des messages');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [conversationId]);

    return { messages, setMessages, loading, hasMore, setHasMore };
}
