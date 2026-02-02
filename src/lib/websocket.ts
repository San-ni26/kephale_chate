/**
 * WebSocket Server for Real-time Communication
 * Handles real-time messaging, online status, and typing indicators
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

interface AuthenticatedSocket extends Socket {
    userId?: string;
    userEmail?: string;
}

let io: SocketIOServer | null = null;

export function initializeWebSocket(httpServer: HTTPServer) {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    io.use(async (socket: AuthenticatedSocket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                return next(new Error('Authentication error'));
            }

            const decoded = verifyToken(token);
            if (!decoded || !decoded.userId) {
                return next(new Error('Invalid token'));
            }

            socket.userId = decoded.userId;
            socket.userEmail = decoded.email;
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', async (socket: AuthenticatedSocket) => {
        console.log(`User connected: ${socket.userId}`);

        if (!socket.userId) return;

        // Update user online status
        await prisma.user.update({
            where: { id: socket.userId },
            data: {
                isOnline: true,
                lastSeen: new Date(),
            },
        });

        // Join user's personal room
        socket.join(`user:${socket.userId}`);

        // Broadcast online status to all users
        io?.emit('user:online', { userId: socket.userId });

        // Handle joining conversation rooms
        socket.on('join:conversation', (conversationId: string) => {
            socket.join(`conversation:${conversationId}`);
            console.log(`User ${socket.userId} joined conversation ${conversationId}`);
        });

        // Handle leaving conversation rooms
        socket.on('leave:conversation', (conversationId: string) => {
            socket.leave(`conversation:${conversationId}`);
        });

        // Handle new message
        socket.on('message:send', async (data: {
            conversationId: string;
            content: string;
            attachments?: any[];
        }) => {
            // Broadcast to conversation room
            io?.to(`conversation:${data.conversationId}`).emit('message:new', {
                conversationId: data.conversationId,
                senderId: socket.userId,
                content: data.content,
                attachments: data.attachments,
                timestamp: new Date(),
            });
        });

        // Handle typing indicator
        socket.on('typing:start', (conversationId: string) => {
            socket.to(`conversation:${conversationId}`).emit('typing:user', {
                userId: socket.userId,
                conversationId,
                isTyping: true,
            });
        });

        socket.on('typing:stop', (conversationId: string) => {
            socket.to(`conversation:${conversationId}`).emit('typing:user', {
                userId: socket.userId,
                conversationId,
                isTyping: false,
            });
        });

        // Handle message read receipts
        socket.on('message:read', (data: { messageId: string; conversationId: string }) => {
            socket.to(`conversation:${data.conversationId}`).emit('message:read', {
                messageId: data.messageId,
                userId: socket.userId,
            });
        });

        // Handle GPS location update (for admin tracking)
        socket.on('location:update', async (data: { latitude: number; longitude: number }) => {
            if (!socket.userId) return;

            await prisma.user.update({
                where: { id: socket.userId },
                data: {
                    currentLocation: {
                        latitude: data.latitude,
                        longitude: data.longitude,
                        timestamp: new Date().toISOString(),
                    } as any,
                },
            });

            // Broadcast to admin room
            io?.to('admin:tracking').emit('user:location', {
                userId: socket.userId,
                latitude: data.latitude,
                longitude: data.longitude,
            });
        });

        // Handle disconnect
        socket.on('disconnect', async () => {
            console.log(`User disconnected: ${socket.userId}`);

            if (!socket.userId) return;

            // Update user offline status
            await prisma.user.update({
                where: { id: socket.userId },
                data: {
                    isOnline: false,
                    lastSeen: new Date(),
                },
            });

            // Broadcast offline status
            io?.emit('user:offline', { userId: socket.userId });
        });
    });

    return io;
}

export function getIO(): SocketIOServer | null {
    return io;
}

// Helper function to emit events from API routes
export function emitToUser(userId: string, event: string, data: any) {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    }
}

export function emitToConversation(conversationId: string, event: string, data: any) {
    if (io) {
        io.to(`conversation:${conversationId}`).emit(event, data);
    }
}
