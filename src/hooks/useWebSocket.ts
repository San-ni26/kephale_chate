/**
 * useWebSocket hook - Pusher-based real-time communication
 * 
 * Channels:
 * - private-user-{userId}: personal notifications, call signaling (SHARED/ref-counted)
 * - presence-conversation-{conversationId}: conversation messages, typing (per-component)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type PusherClient from 'pusher-js';
import type { Channel, PresenceChannel } from 'pusher-js';
import { getPusherClient, acquireUserChannel, releaseUserChannel } from '@/src/lib/pusher-client';
import { getUser, getToken, fetchWithAuth } from '@/src/lib/auth-client';

// ---- Type definitions ----

export interface SocketMessage {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
    updatedAt: string;
    isEdited: boolean;
    attachments?: any[];
    sender: {
        id: string;
        name: string;
        email: string;
        publicKey: string;
    };
}

export interface UseWebSocketReturn {
    socket: PusherClient | null;
    isConnected: boolean;
    sendMessage: (conversationId: string, content: string, attachments?: any[]) => void;
    editMessage: (messageId: string, content: string) => void;
    deleteMessage: (messageId: string) => void;
    joinConversation: (conversationId: string) => void;
    leaveConversation: (conversationId: string) => void;
    startTyping: (conversationId: string) => void;
    stopTyping: (conversationId: string) => void;
    userChannel: Channel | null;
    conversationChannel: Channel | null;
}

/**
 * React hook for real-time communication via Pusher.
 * The user's private channel is SHARED across all component instances (ref-counted).
 * Conversation channels are per-component.
 */
export function useWebSocket(
    onNewMessage?: (data: { conversationId: string; message: SocketMessage }) => void,
    onMessageEdited?: (data: { conversationId: string; message: SocketMessage }) => void,
    onMessageDeleted?: (data: { conversationId: string; messageId: string }) => void,
    onUserTyping?: (data: { conversationId: string; userId: string; isTyping: boolean }) => void,
    onUserStatusChanged?: (data: { userId: string; isOnline: boolean }) => void,
    onError?: (error: { message: string }) => void
): UseWebSocketReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [pusher, setPusher] = useState<PusherClient | null>(null);
    const [userChannel, setUserChannel] = useState<Channel | null>(null);
    const [conversationChannel, setConversationChannel] = useState<Channel | null>(null);
    const currentConversationRef = useRef<string | null>(null);

    // Store callbacks in refs to avoid re-subscriptions
    const onNewMessageRef = useRef(onNewMessage);
    const onMessageEditedRef = useRef(onMessageEdited);
    const onMessageDeletedRef = useRef(onMessageDeleted);
    const onUserTypingRef = useRef(onUserTyping);
    const onUserStatusChangedRef = useRef(onUserStatusChanged);
    const onErrorRef = useRef(onError);

    onNewMessageRef.current = onNewMessage;
    onMessageEditedRef.current = onMessageEdited;
    onMessageDeletedRef.current = onMessageDeleted;
    onUserTypingRef.current = onUserTyping;
    onUserStatusChangedRef.current = onUserStatusChanged;
    onErrorRef.current = onError;

    // Initialize Pusher and acquire user channel
    useEffect(() => {
        const user = getUser();
        if (!user) return;

        const client = getPusherClient();
        if (!client) return;

        setPusher(client);

        // Connection state handlers
        const onConnected = () => {
            console.log('[Pusher] Connected');
            setIsConnected(true);
        };

        const onDisconnected = () => {
            console.log('[Pusher] Disconnected');
            setIsConnected(false);
        };

        const onErr = (err: any) => {
            console.error('[Pusher] Connection error:', err);
            setIsConnected(false);
            onErrorRef.current?.({ message: err?.message || err?.data?.message || 'Connection error' });
        };

        client.connection.bind('connected', onConnected);
        client.connection.bind('disconnected', onDisconnected);
        client.connection.bind('error', onErr);

        if (client.connection.state === 'connected') {
            setIsConnected(true);
        }

        // Acquire shared user channel (ref-counted)
        const uChannel = acquireUserChannel();
        if (uChannel) {
            setUserChannel(uChannel);
        }

        return () => {
            client.connection.unbind('connected', onConnected);
            client.connection.unbind('disconnected', onDisconnected);
            client.connection.unbind('error', onErr);
            // Release our ref to the user channel (won't unsubscribe if others still use it)
            releaseUserChannel();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-subscribe to conversation channel on reconnect
    useEffect(() => {
        if (!pusher || !isConnected || !currentConversationRef.current) return;

        const convId = currentConversationRef.current;
        const channelName = `presence-conversation-${convId}`;
        const existingChannel = pusher.channel(channelName);

        if (!existingChannel || !existingChannel.subscribed) {
            console.log('[Pusher] Re-subscribing to conversation after reconnect:', convId);
            joinConversationInternal(convId);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, pusher]);

    // Internal join logic
    const joinConversationInternal = useCallback((conversationId: string) => {
        if (!pusher) return;

        const channelName = `presence-conversation-${conversationId}`;
        const channel = pusher.subscribe(channelName) as PresenceChannel;

        channel.bind('pusher:subscription_succeeded', () => {
            console.log('[Pusher] Joined conversation:', conversationId);
        });

        channel.bind('pusher:subscription_error', (err: any) => {
            console.error('[Pusher] Conversation subscription error:', conversationId, err);
        });

        // Message events
        channel.bind('message:new', (data: { conversationId: string; message: SocketMessage }) => {
            onNewMessageRef.current?.(data);
        });

        channel.bind('message:edited', (data: { conversationId: string; message: SocketMessage }) => {
            onMessageEditedRef.current?.(data);
        });

        channel.bind('message:deleted', (data: { conversationId: string; messageId: string }) => {
            onMessageDeletedRef.current?.(data);
        });

        // Typing events (ignore own typing echo)
        channel.bind('typing:user', (data: { conversationId: string; userId: string; isTyping: boolean }) => {
            const user = getUser();
            if (data.userId === user?.id) return;
            onUserTypingRef.current?.(data);
        });

        // User presence events
        channel.bind('pusher:member_added', (member: { id: string }) => {
            onUserStatusChangedRef.current?.({ userId: member.id, isOnline: true });
        });

        channel.bind('pusher:member_removed', (member: { id: string }) => {
            onUserStatusChangedRef.current?.({ userId: member.id, isOnline: false });
        });

        setConversationChannel(channel);
    }, [pusher]);

    // Join/leave conversation channel
    const joinConversation = useCallback((conversationId: string) => {
        if (!pusher) return;

        // Leave previous conversation if any
        if (currentConversationRef.current && currentConversationRef.current !== conversationId) {
            pusher.unsubscribe(`presence-conversation-${currentConversationRef.current}`);
        }

        currentConversationRef.current = conversationId;
        joinConversationInternal(conversationId);
    }, [pusher, joinConversationInternal]);

    const leaveConversation = useCallback((conversationId: string) => {
        if (!pusher) return;
        pusher.unsubscribe(`presence-conversation-${conversationId}`);
        if (currentConversationRef.current === conversationId) {
            currentConversationRef.current = null;
            setConversationChannel(null);
        }
    }, [pusher]);

    // ---- Action functions ----

    const sendMessage = useCallback((_conversationId: string, _content: string, _attachments?: any[]) => {
        // Messages sent via POST /api/conversations/[id]/messages
    }, []);

    const editMessage = useCallback((_messageId: string, _content: string) => {
        // Edits sent via PATCH /api/messages/[id]
    }, []);

    const deleteMessage = useCallback((_messageId: string) => {
        // Deletes sent via DELETE /api/messages/[id]
    }, []);

    const startTyping = useCallback((conversationId: string) => {
        fetchWithAuth('/api/pusher/typing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, isTyping: true }),
        }).catch(() => {});
    }, []);

    const stopTyping = useCallback((conversationId: string) => {
        fetchWithAuth('/api/pusher/typing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, isTyping: false }),
        }).catch(() => {});
    }, []);

    return {
        socket: pusher,
        isConnected,
        sendMessage,
        editMessage,
        deleteMessage,
        joinConversation,
        leaveConversation,
        startTyping,
        stopTyping,
        userChannel,
        conversationChannel,
    };
}
