/**
 * WebSocket Server for Real-time Communication
 * Handles real-time messaging, online status, and typing indicators
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
import { sendPushNotification } from '@/src/lib/push';

interface AuthenticatedSocket extends Socket {
    userId?: string;
    userEmail?: string;
}

let io: SocketIOServer | null = null;

export function initializeWebSocket(httpServer: HTTPServer) {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: process.env.NEXT_PUBLIC_APP_URL,
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
            try {
                if (!socket.userId) return;

                // Verify user is member of conversation
                const membership = await prisma.groupMember.findFirst({
                    where: {
                        groupId: data.conversationId,
                        userId: socket.userId,
                    },
                });

                if (!membership) {
                    socket.emit('error', { message: 'Accès refusé' });
                    return;
                }

                // Create message in database
                const message = await prisma.message.create({
                    data: {
                        content: data.content,
                        senderId: socket.userId,
                        groupId: data.conversationId,
                        attachments: data.attachments ? {
                            create: data.attachments
                        } : undefined,
                    },
                    include: {
                        sender: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                publicKey: true,
                            },
                        },
                        attachments: true,
                    },
                });

                // Update conversation timestamp
                await prisma.group.update({
                    where: { id: data.conversationId },
                    data: { updatedAt: new Date() },
                });

                // Use the shared notification helper
                await notifyNewMessage(message, data.conversationId);

            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
            }
        });

        // Handle message edit
        socket.on('message:edit', async (data: { messageId: string; content: string }) => {
            try {
                if (!socket.userId) return;

                const message = await prisma.message.findUnique({
                    where: { id: data.messageId },
                });

                if (!message || message.senderId !== socket.userId) {
                    socket.emit('error', { message: 'Accès refusé' });
                    return;
                }

                const updatedMessage = await prisma.message.update({
                    where: { id: data.messageId },
                    data: {
                        content: data.content,
                        isEdited: true,
                    },
                    include: {
                        sender: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                publicKey: true,
                            },
                        },
                        attachments: true,
                    },
                });

                io?.to(`conversation:${message.groupId}`).emit('message:edited', {
                    conversationId: message.groupId,
                    message: updatedMessage,
                });

            } catch (error) {
                console.error('Error editing message:', error);
                socket.emit('error', { message: 'Erreur lors de la modification' });
            }
        });

        // Handle message delete
        socket.on('message:delete', async (messageId: string) => {
            try {
                if (!socket.userId) return;

                const message = await prisma.message.findUnique({
                    where: { id: messageId },
                });

                if (!message || message.senderId !== socket.userId) {
                    socket.emit('error', { message: 'Accès refusé' });
                    return;
                }

                await prisma.message.delete({
                    where: { id: messageId },
                });

                io?.to(`conversation:${message.groupId}`).emit('message:deleted', {
                    conversationId: message.groupId,
                    messageId: messageId,
                });

            } catch (error) {
                console.error('Error deleting message:', error);
                socket.emit('error', { message: 'Erreur lors de la suppression' });
            }
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

        // --- Voice Call Signaling ---

        // Handle call invite
        socket.on('call:invite', (data: { recipientId: string; offer: any; conversationId: string }) => {
            console.log(`Call invite from ${socket.userId} to ${data.recipientId}`);
            // Forward the offer to the specific user
            io?.to(`user:${data.recipientId}`).emit('call:incoming', {
                callerId: socket.userId,
                callerName: socket.userEmail, // Or fetch name if available in socket
                offer: data.offer,
                conversationId: data.conversationId,
            });
        });

        // Handle call answer
        socket.on('call:answer', (data: { callerId: string; answer: any }) => {
            console.log(`Call answered by ${socket.userId} for ${data.callerId}`);
            io?.to(`user:${data.callerId}`).emit('call:answered', {
                answer: data.answer,
                responderId: socket.userId
            });
        });

        // Handle call rejection/busy
        socket.on('call:reject', (data: { callerId: string }) => {
            io?.to(`user:${data.callerId}`).emit('call:rejected', {
                responderId: socket.userId
            });
        });

        // Handle ICE candidates
        socket.on('call:ice-candidate', (data: { targetUserId: string; candidate: any }) => {
            io?.to(`user:${data.targetUserId}`).emit('call:ice-candidate', {
                candidate: data.candidate,
                senderId: socket.userId
            });
        });

        // Handle call end
        socket.on('call:end', (data: { targetUserId: string }) => {
            io?.to(`user:${data.targetUserId}`).emit('call:ended', {
                enderId: socket.userId
            });
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

export async function notifyNewMessage(message: any, conversationId: string) {
    // Broadcast to all users in the conversation
    // We strive to get the latest IO instance
    const socketIO = io;

    if (socketIO) {
        socketIO.to(`conversation:${conversationId}`).emit('message:new', {
            conversationId,
            message,
        });
    }

    // Notify other group members
    const groupMembers = await prisma.groupMember.findMany({
        where: {
            groupId: conversationId,
            userId: { not: message.senderId } // Exclude sender
        },
        include: {
            user: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    });

    // Create notifications for each member
    // valid for both socket and api route usage
    const notificationPromises = groupMembers.map(async (member) => {
        const notificationContent = `Nouveau message de ${message.sender.name}`;

        // Create DB notification
        const notification = await prisma.notification.create({
            data: {
                userId: member.userId,
                content: notificationContent,
                isRead: false,
            }
        });

        // Emit to user's personal room if connected
        if (socketIO) {
            socketIO.to(`user:${member.userId}`).emit('notification:new', {
                id: notification.id,
                content: notificationContent,
                messageId: message.id,
                conversationId: conversationId,
                senderName: message.sender.name,
                createdAt: notification.createdAt
            });
        }

        // Check if user is active in this conversation
        let isUserInConversation = false;
        if (socketIO) {
            const userSockets = socketIO.sockets.adapter.rooms.get(`user:${member.userId}`);
            const conversationSockets = socketIO.sockets.adapter.rooms.get(`conversation:${conversationId}`);

            if (userSockets && conversationSockets) {
                for (const socketId of userSockets) {
                    if (conversationSockets.has(socketId)) {
                        isUserInConversation = true;
                        break;
                    }
                }
            }
        }

        // Send Web Push Notification only if user is NOT in conversation
        try {
            if (isUserInConversation) return;

            const subscriptions = await prisma.pushSubscription.findMany({
                where: { userId: member.userId }
            });

            if (subscriptions.length > 0) {
                const payload = JSON.stringify({
                    title: `Nouveau message de ${message.sender.name}`,
                    body: message.content ? (message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content) : 'Pièce jointe',
                    icon: '/icons/icon-192x192.png', // Adjust path based on your PWA icons
                    url: `/chat/discussion/${conversationId}`,
                    data: {
                        conversationId,
                        messageId: message.id
                    }
                });

                await Promise.all(subscriptions.map(async (sub) => {
                    try {
                        await sendPushNotification({
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth
                            }
                        }, payload);
                    } catch (err: any) {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            // Subscription is invalid or expired, remove it
                            await prisma.pushSubscription.delete({
                                where: { endpoint: sub.endpoint }
                            });
                        }
                    }
                }));
            }
        } catch (pushError) {
            console.error('Failed to send push notification:', pushError);
        }
    });

    await Promise.all(notificationPromises);
}
