import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
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

interface UseWebSocketReturn {
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

export function useWebSocket(
    onNewMessage?: (data: { conversationId: string; message: Message }) => void,
    onMessageEdited?: (data: { conversationId: string; message: Message }) => void,
    onMessageDeleted?: (data: { conversationId: string; messageId: string }) => void,
    onUserTyping?: (data: { conversationId: string; userId: string; isTyping: boolean }) => void,
    onUserStatusChanged?: (data: { userId: string; isOnline: boolean }) => void,
    onError?: (error: { message: string }) => void
): UseWebSocketReturn {
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // Get token from localStorage using the correct key
        const token = localStorage.getItem('auth-token');
        if (!token) {
            console.warn('No authentication token found - WebSocket will not connect');
            return;
        }

        // Initialize Socket.IO server first
        const initSocketIO = async () => {
            try {
                await fetch('/api/socket');
            } catch (error) {
                console.error('Failed to initialize Socket.IO:', error);
            }

            // Initialize socket connection
            const socket = io(process.env.NEXT_PUBLIC_APP_URL, {
                auth: { token },
                autoConnect: true,
            });

            socketRef.current = socket;

            // Connection events
            socket.on('connect', () => {
                console.log('WebSocket connected');
                setIsConnected(true);
            });

            socket.on('disconnect', () => {
                console.log('WebSocket disconnected');
                setIsConnected(false);
            });

            socket.on('connect_error', (error) => {
                console.error('WebSocket connection error:', error);
                setIsConnected(false);
            });

            // Message events
            socket.on('message:new', (data: { conversationId: string; message: Message }) => {
                console.log('New message received:', data);
                onNewMessage?.(data);
            });

            socket.on('message:edited', (data: { conversationId: string; message: Message }) => {
                console.log('Message edited:', data);
                onMessageEdited?.(data);
            });

            socket.on('message:deleted', (data: { conversationId: string; messageId: string }) => {
                console.log('Message deleted:', data);
                onMessageDeleted?.(data);
            });

            // Typing events
            socket.on('typing:user', (data: { conversationId: string; userId: string; isTyping: boolean }) => {
                onUserTyping?.(data);
            });

            // User status events
            socket.on('user:online', (data: { userId: string }) => {
                onUserStatusChanged?.({ userId: data.userId, isOnline: true });
            });

            socket.on('user:offline', (data: { userId: string }) => {
                onUserStatusChanged?.({ userId: data.userId, isOnline: false });
            });

            // Error events
            socket.on('error', (error: { message: string }) => {
                console.error('WebSocket error:', error);
                onError?.(error);
            });
        };

        // Call the initialization function
        initSocketIO();

        // Cleanup on unmount
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [onNewMessage, onMessageEdited, onMessageDeleted, onUserTyping, onUserStatusChanged, onError]);

    const sendMessage = (conversationId: string, content: string, attachments?: any[]) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('message:send', {
                conversationId,
                content,
                attachments,
            });
        }
    };

    const editMessage = (messageId: string, content: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('message:edit', {
                messageId,
                content,
            });
        }
    };

    const deleteMessage = (messageId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('message:delete', messageId);
        }
    };

    const joinConversation = (conversationId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('join:conversation', conversationId);
        }
    };

    const leaveConversation = (conversationId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('leave:conversation', conversationId);
        }
    };

    const startTyping = (conversationId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('typing:start', conversationId);
        }
    };

    const stopTyping = (conversationId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('typing:stop', conversationId);
        }
    };

    return {
        socket: socketRef.current,
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
