/**
 * WebSocket Client Hook
 * React hook for managing WebSocket connections
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseWebSocketOptions {
    token: string | null;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
}

export function useWebSocket(options: UseWebSocketOptions) {
    const { token, onConnect, onDisconnect, onError } = options;
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!token) return;

        const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000', {
            auth: { token },
            autoConnect: true,
        });

        socket.on('connect', () => {
            console.log('WebSocket connected');
            setIsConnected(true);
            onConnect?.();
        });

        socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            setIsConnected(false);
            onDisconnect?.();
        });

        socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            onError?.(error);
        });

        socketRef.current = socket;

        return () => {
            socket.disconnect();
        };
    }, [token, onConnect, onDisconnect, onError]);

    const joinConversation = (conversationId: string) => {
        socketRef.current?.emit('join:conversation', conversationId);
    };

    const leaveConversation = (conversationId: string) => {
        socketRef.current?.emit('leave:conversation', conversationId);
    };

    const sendMessage = (conversationId: string, content: string, attachments?: any[]) => {
        socketRef.current?.emit('message:send', {
            conversationId,
            content,
            attachments,
        });
    };

    const startTyping = (conversationId: string) => {
        socketRef.current?.emit('typing:start', conversationId);
    };

    const stopTyping = (conversationId: string) => {
        socketRef.current?.emit('typing:stop', conversationId);
    };

    const markMessageRead = (messageId: string, conversationId: string) => {
        socketRef.current?.emit('message:read', { messageId, conversationId });
    };

    const updateLocation = (latitude: number, longitude: number) => {
        socketRef.current?.emit('location:update', { latitude, longitude });
    };

    const on = (event: string, callback: (...args: any[]) => void) => {
        socketRef.current?.on(event, callback);
    };

    const off = (event: string, callback?: (...args: any[]) => void) => {
        socketRef.current?.off(event, callback);
    };

    return {
        socket: socketRef.current,
        isConnected,
        joinConversation,
        leaveConversation,
        sendMessage,
        startTyping,
        stopTyping,
        markMessageRead,
        updateLocation,
        on,
        off,
    };
}
