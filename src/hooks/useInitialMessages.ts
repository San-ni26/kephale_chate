'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/src/lib/auth-client';

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
const TEMP_MESSAGES_KEY = 'chat_temp_messages';

function getCachedMessages(conversationId: string): { messages: Message[]; hasMore: boolean } | null {
    try {
        // Essayer d'abord sessionStorage (cache rapide)
        const raw = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${conversationId}`);
        if (raw) return JSON.parse(raw);
        
        // Fallback sur localStorage (persiste plus longtemps)
        const localRaw = localStorage.getItem(`${CACHE_KEY_PREFIX}${conversationId}`);
        if (localRaw) return JSON.parse(localRaw);
        
        return null;
    } catch {
        return null;
    }
}

function setCachedMessages(conversationId: string, messages: Message[], hasMore: boolean) {
    try {
        const data = JSON.stringify({ messages, hasMore });
        sessionStorage.setItem(`${CACHE_KEY_PREFIX}${conversationId}`, data);
        localStorage.setItem(`${CACHE_KEY_PREFIX}${conversationId}`, data);
    } catch { /* storage full — ignore */ }
}

function removeCachedMessage(conversationId: string, messageId: string) {
    try {
        // Supprimer de sessionStorage
        const sessionRaw = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${conversationId}`);
        if (sessionRaw) {
            const data = JSON.parse(sessionRaw);
            data.messages = data.messages.filter((m: Message) => m.id !== messageId);
            sessionStorage.setItem(`${CACHE_KEY_PREFIX}${conversationId}`, JSON.stringify(data));
        }
        
        // Supprimer de localStorage
        const localRaw = localStorage.getItem(`${CACHE_KEY_PREFIX}${conversationId}`);
        if (localRaw) {
            const data = JSON.parse(localRaw);
            data.messages = data.messages.filter((m: Message) => m.id !== messageId);
            localStorage.setItem(`${CACHE_KEY_PREFIX}${conversationId}`, JSON.stringify(data));
        }
        
        // Supprimer aussi des messages temporaires
        const allTemps = JSON.parse(localStorage.getItem(TEMP_MESSAGES_KEY) || '{}');
        if (allTemps[conversationId]) {
            allTemps[conversationId] = allTemps[conversationId].filter((m: Message) => m.id !== messageId);
            localStorage.setItem(TEMP_MESSAGES_KEY, JSON.stringify(allTemps));
        }
    } catch { /* ignore */ }
}

function getTempMessages(conversationId: string): Message[] {
    try {
        const allTemps = JSON.parse(localStorage.getItem(TEMP_MESSAGES_KEY) || '{}');
        return allTemps[conversationId] || [];
    } catch {
        return [];
    }
}

export function useInitialMessages(conversationId: string | null) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const prevConversationId = useRef<string | null>(null);
    const isFirstLoad = useRef(true);

    useEffect(() => {
        if (!conversationId) return;

        const isNewConversation = prevConversationId.current !== conversationId;
        prevConversationId.current = conversationId;

        // 1. Charger IMMÉDIATEMENT depuis le cache (pas de délai)
        const cached = getCachedMessages(conversationId);
        const savedTemps = getTempMessages(conversationId);
        
        if (cached) {
            // Fusionner les messages du cache avec les temporaires
            const allMessages = [...cached.messages];
            if (savedTemps.length > 0) {
                const existingIds = new Set(allMessages.map(m => m.id));
                const newTemps = savedTemps.filter(m => !existingIds.has(m.id));
                allMessages.push(...newTemps);
            }
            setMessages(allMessages);
            setHasMore(cached.hasMore);
            setLoading(false);
        } else if (savedTemps.length > 0) {
            // Seulement des messages temporaires
            setMessages(savedTemps);
            setLoading(false);
        } else if (isNewConversation) {
            setLoading(true);
            setMessages([]);
            setHasMore(true);
        }

        const url = `/api/conversations/${conversationId}/messages?limit=50`;

        // 2. Synchroniser en arrière-plan avec le serveur
        const syncWithServer = async () => {
            try {
                const res = await fetchWithAuth(url);
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    const msg = (errBody as { error?: string })?.error || `Erreur ${res.status}`;
                    throw new Error(msg);
                }
                const data = await res.json();
                const serverMsgs = data.messages ?? [];
                const more = data.hasMore !== false;
                
                // Fusionner avec les messages existants (garde les temporaires)
                setMessages(prev => {
                    if (prev.length === 0) {
                        // Premier chargement - utiliser directement le serveur
                        setCachedMessages(conversationId, serverMsgs, more);
                        return serverMsgs;
                    }
                    
                    // Créer un map des messages serveur par ID
                    const serverMap = new Map(serverMsgs.map((m: Message) => [m.id, m]));
                    
                    // Messages temporaires non encore confirmés par le serveur
                    const tempMessages = prev.filter(m => 
                        m.id.startsWith('temp-') && !serverMap.has(m.id)
                    );
                    
                    // Messages supprimés localement qui ne sont plus sur le serveur
                    // (le serveur les a déjà supprimés)
                    const finalMessages = [...serverMsgs, ...tempMessages];
                    
                    // Mettre à jour le cache
                    setCachedMessages(conversationId, serverMsgs, more);
                    
                    return finalMessages;
                });
                
                setHasMore(more);
            } catch (error) {
                console.warn('Sync failed:', error);
                // Ne pas afficher de toast - le cache est déjà affiché
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        };

        // Lancer la synchro en arrière-plan
        syncWithServer();
        
        // 3. Polling léger pour garder la sync (toutes les 5 secondes)
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                syncWithServer();
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [conversationId]);

    return { messages, setMessages, loading, hasMore, setHasMore, refreshing };
}
