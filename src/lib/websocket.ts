/**
 * Real-time Notification System
 * 
 * Uses Pusher for serverless-compatible real-time communication.
 * This module provides helpers called from API routes to push events to clients.
 * 
 * Replaces the old Socket.IO server which required a persistent process.
 */

import { prisma } from '@/src/lib/prisma';
import { sendPushNotification } from '@/src/lib/push';
import { getPusher, emitToUser, emitToConversation } from '@/src/lib/pusher-server';

// Re-export helpers for backward compatibility
export { emitToUser, emitToConversation };

/**
 * Notify all members of a conversation about a new message.
 * Called from API routes after creating a message.
 * 
 * This function:
 * 1. Broadcasts the message to the conversation's Pusher channel
 * 2. Creates in-app notifications for all members except the sender
 * 3. Sends push notifications to members not currently in the conversation
 */
export async function notifyNewMessage(message: any, conversationId: string) {
    try {
        // 1. Broadcast to the conversation channel via Pusher
        await emitToConversation(conversationId, 'message:new', {
            conversationId,
            message,
        });
    } catch (err) {
        console.error('Error broadcasting message via Pusher:', err);
    }

    // 2. Get all group members except sender
    const groupMembers = await prisma.groupMember.findMany({
        where: {
            groupId: conversationId,
            userId: { not: message.senderId }
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

    // 3. Create notifications and send push for each member
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

        // Emit to user's private Pusher channel
        try {
            await emitToUser(member.userId, 'notification:new', {
                id: notification.id,
                content: notificationContent,
                messageId: message.id,
                conversationId: conversationId,
                senderName: message.sender.name,
                createdAt: notification.createdAt
            });
        } catch (err) {
            console.error(`Error sending notification to user ${member.userId}:`, err);
        }

        // Send Web Push Notification
        try {
            const subscriptions = await prisma.pushSubscription.findMany({
                where: { userId: member.userId }
            });

            if (subscriptions.length > 0) {
                const payload = JSON.stringify({
                    title: `Nouveau message de ${message.sender.name}`,
                    body: message.content
                        ? (message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content)
                        : 'Pièce jointe',
                    icon: '/icons/icon-192x192.png',
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

/**
 * Send call notification to a user via Pusher + Web Push
 */
export async function notifyIncomingCall(
    recipientId: string,
    callerId: string,
    callerName: string,
    offer: any,
    conversationId: string
) {
    // Send via Pusher (real-time, if user is online)
    try {
        await emitToUser(recipientId, 'call:incoming', {
            callerId,
            callerName,
            offer,
            conversationId,
        });
    } catch (err) {
        console.error('Error sending call via Pusher:', err);
    }

    // Also send Web Push (in case user has app in background)
    try {
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId: recipientId }
        });

        if (subscriptions.length > 0) {
            const payload = JSON.stringify({
                title: `Appel entrant de ${callerName}`,
                body: 'Appuyez pour répondre',
                icon: '/icons/icon-192x192.png',
                url: `/chat/discussion/${conversationId}`,
                type: 'call',
                data: {
                    conversationId,
                    callerId,
                }
            });

            await Promise.all(subscriptions.map(async (sub) => {
                try {
                    await sendPushNotification({
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth }
                    }, payload);
                } catch (err: any) {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await prisma.pushSubscription.delete({
                            where: { endpoint: sub.endpoint }
                        });
                    }
                }
            }));
        }
    } catch (pushError) {
        console.error('Failed to send call push notification:', pushError);
    }
}
