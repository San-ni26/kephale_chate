import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getToken } from '@/src/lib/auth-client';

/**
 * Singleton Socket.IO connection manager.
 * Ensures a single socket instance is shared across all components.
 */
let globalSocket: Socket | null = null;
let globalSocketToken: string | null = null;
let connectionRefCount = 0;

function getOrCreateSocket(): Socket | null {
    const token = getToken();
    if (!token) {
        console.warn('No authentication token found - WebSocket will not connect');
        return null;
    }

    // If token changed (re-login), disconnect old socket
    if (globalSocket && globalSocketToken !== token) {
        console.log('Token changed, reconnecting WebSocket...');
        globalSocket.disconnect();
        globalSocket = null;
        globalSocketToken = null;
    }

    // Return existing connected socket
    if (globalSocket) {
        return globalSocket;
    }

    // Create new socket
    const url = process.env.NEXT_PUBLIC_APP_URL || undefined;
    console.log('Creating Socket.IO connection to:', url);

    globalSocket = io(url, {
        auth: { token },
        autoConnect: true,
        transports: ['polling', 'websocket'],
        path: '/socket.io/',
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
    });

    globalSocketToken = token;

    globalSocket.on('connect', () => {
        console.log('WebSocket connected, id:', globalSocket?.id);
    });

    globalSocket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
    });

    globalSocket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error.message);
    });

    return globalSocket;
}

function releaseSocket() {
    connectionRefCount--;
    if (connectionRefCount <= 0) {
        connectionRefCount = 0;
        if (globalSocket) {
            console.log('All components unmounted, disconnecting WebSocket');
            globalSocket.disconnect();
            globalSocket = null;
            globalSocketToken = null;
        }
    }
}

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
    socket: Socket | null;
    isConnected: boolean;
    sendMessage: (conversationId: string, content: string, attachments?: any[]) => void;
    editMessage: (messageId: string, content: string) => void;
    deleteMessage: (messageId: string) => void;
    joinConversation: (conversationId: string) => void;
    leaveConversation: (conversationId: string) => void;
    startTyping: (conversationId: string) => void;
    stopTyping: (conversationId: string) => void;
}

/**
 * React hook for WebSocket real-time communication.
 * Uses a singleton pattern to share a single socket connection.
 * 
 * Callbacks are stored in refs to avoid reconnection on every render.
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
    const [socket, setSocket] = useState<Socket | null>(null);

    // Store callbacks in refs to prevent useEffect re-runs
    const onNewMessageRef = useRef(onNewMessage);
    const onMessageEditedRef = useRef(onMessageEdited);
    const onMessageDeletedRef = useRef(onMessageDeleted);
    const onUserTypingRef = useRef(onUserTyping);
    const onUserStatusChangedRef = useRef(onUserStatusChanged);
    const onErrorRef = useRef(onError);

    // Update refs on each render (no re-render triggered)
    onNewMessageRef.current = onNewMessage;
    onMessageEditedRef.current = onMessageEdited;
    onMessageDeletedRef.current = onMessageDeleted;
    onUserTypingRef.current = onUserTyping;
    onUserStatusChangedRef.current = onUserStatusChanged;
    onErrorRef.current = onError;

    useEffect(() => {
        const sock = getOrCreateSocket();
        if (!sock) return;

        connectionRefCount++;
        setSocket(sock);

        // Connection state handlers
        const handleConnect = () => setIsConnected(true);
        const handleDisconnect = () => setIsConnected(false);
        const handleConnectError = () => setIsConnected(false);

        // If already connected, set state immediately
        if (sock.connected) {
            setIsConnected(true);
        }

        sock.on('connect', handleConnect);
        sock.on('disconnect', handleDisconnect);
        sock.on('connect_error', handleConnectError);

        // Message events - use ref-based callbacks so they always call the latest version
        const handleNewMessage = (data: { conversationId: string; message: SocketMessage }) => {
            onNewMessageRef.current?.(data);
        };

        const handleMessageEdited = (data: { conversationId: string; message: SocketMessage }) => {
            onMessageEditedRef.current?.(data);
        };

        const handleMessageDeleted = (data: { conversationId: string; messageId: string }) => {
            onMessageDeletedRef.current?.(data);
        };

        const handleUserTyping = (data: { conversationId: string; userId: string; isTyping: boolean }) => {
            onUserTypingRef.current?.(data);
        };

        const handleUserOnline = (data: { userId: string }) => {
            onUserStatusChangedRef.current?.({ userId: data.userId, isOnline: true });
        };

        const handleUserOffline = (data: { userId: string }) => {
            onUserStatusChangedRef.current?.({ userId: data.userId, isOnline: false });
        };

        const handleError = (error: { message: string }) => {
            console.error('WebSocket error:', error);
            onErrorRef.current?.(error);
        };

        sock.on('message:new', handleNewMessage);
        sock.on('message:edited', handleMessageEdited);
        sock.on('message:deleted', handleMessageDeleted);
        sock.on('typing:user', handleUserTyping);
        sock.on('user:online', handleUserOnline);
        sock.on('user:offline', handleUserOffline);
        sock.on('error', handleError);

        // Cleanup: remove THIS component's listeners, not the socket itself
        return () => {
            sock.off('connect', handleConnect);
            sock.off('disconnect', handleDisconnect);
            sock.off('connect_error', handleConnectError);
            sock.off('message:new', handleNewMessage);
            sock.off('message:edited', handleMessageEdited);
            sock.off('message:deleted', handleMessageDeleted);
            sock.off('typing:user', handleUserTyping);
            sock.off('user:online', handleUserOnline);
            sock.off('user:offline', handleUserOffline);
            sock.off('error', handleError);
            releaseSocket();
        };
    // No dependencies on callbacks - they are stored in refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- Action functions (stable references via useCallback) ----

    const sendMessage = useCallback((conversationId: string, content: string, attachments?: any[]) => {
        if (globalSocket?.connected) {
            globalSocket.emit('message:send', { conversationId, content, attachments });
        }
    }, []);

    const editMessage = useCallback((messageId: string, content: string) => {
        if (globalSocket?.connected) {
            globalSocket.emit('message:edit', { messageId, content });
        }
    }, []);

    const deleteMessage = useCallback((messageId: string) => {
        if (globalSocket?.connected) {
            globalSocket.emit('message:delete', messageId);
        }
    }, []);

    const joinConversation = useCallback((conversationId: string) => {
        if (globalSocket?.connected) {
            globalSocket.emit('join:conversation', conversationId);
            console.log('Joined conversation room:', conversationId);
        }
    }, []);

    const leaveConversation = useCallback((conversationId: string) => {
        if (globalSocket?.connected) {
            globalSocket.emit('leave:conversation', conversationId);
            console.log('Left conversation room:', conversationId);
        }
    }, []);

    const startTyping = useCallback((conversationId: string) => {
        if (globalSocket?.connected) {
            globalSocket.emit('typing:start', conversationId);
        }
    }, []);

    const stopTyping = useCallback((conversationId: string) => {
        if (globalSocket?.connected) {
            globalSocket.emit('typing:stop', conversationId);
        }
    }, []);

    return {
        socket,
        isConnected,
        sendMessage,
        editMessage,
        deleteMessage,
        joinConversation,
        leaveConversation,
        startTyping,
        stopTyping,
    };
}
