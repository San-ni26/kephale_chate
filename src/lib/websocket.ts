/**
 * Real-time Notification System
 * 
 * Uses Pusher for serverless-compatible real-time communication.
 * This module provides helpers called from API routes to push events to clients.
 */

import { prisma } from '@/src/lib/prisma';
import { sendPushNotification } from '@/src/lib/push';
import { emitToUser, emitToConversation } from '@/src/lib/pusher-server';

// Re-export helpers for backward compatibility
export { emitToUser, emitToConversation };

/**
 * Notify all members of a conversation about a new message.
 * Called from API routes after creating a message.
 * 
 * Flow:
 * 1. Broadcast message:new to Pusher conversation channel (real-time, in-app)
 * 2. For each member (except sender):
 *    a. Create DB notification
 *    b. Send notification:new to user's private Pusher channel (in-app toast)
 *    c. Send Web Push notification (works when app is closed/background!)
 */
export async function notifyNewMessage(message: any, conversationId: string) {
    // 1. Broadcast to the conversation channel via Pusher
    try {
        await emitToConversation(conversationId, 'message:new', {
            conversationId,
            message,
        });
        if (process.env.NODE_ENV === 'development') {
            console.log('[Notify] Broadcast message:new to conversation:', conversationId);
        }
    } catch (err) {
        console.error('[Notify] Error broadcasting message via Pusher:', err);
    }

    // 2. Get all group members except sender
    let groupMembers;
    try {
        groupMembers = await prisma.groupMember.findMany({
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
    } catch (err) {
        console.error('[Notify] Error fetching group members:', err);
        return;
    }

    if (process.env.NODE_ENV === 'development') {
        console.log('[Notify] Notifying', groupMembers.length, 'members');
    }

    // 3. Create notifications and send push for each member
    const notificationPromises = groupMembers.map(async (member) => {
        const notificationContent = `Nouveau message de ${message.sender?.name || 'Utilisateur'}`;

        // Create DB notification
        let notification;
        try {
            notification = await prisma.notification.create({
                data: {
                    userId: member.userId,
                    content: notificationContent,
                    isRead: false,
                }
            });
        } catch (err) {
            console.error(`[Notify] Error creating notification for user ${member.userId}:`, err);
            return;
        }

        // Emit to user's private Pusher channel (in-app toast)
        try {
            await emitToUser(member.userId, 'notification:new', {
                id: notification.id,
                content: notificationContent,
                messageId: message.id,
                conversationId: conversationId,
                senderName: message.sender?.name || 'Utilisateur',
                createdAt: notification.createdAt
            });
        } catch (err) {
            console.error(`[Notify] Error sending Pusher notification to user ${member.userId}:`, err);
        }

        // Send Web Push Notification (this is what works when app is CLOSED)
        try {
            const subscriptions = await prisma.pushSubscription.findMany({
                where: { userId: member.userId }
            });

            if (process.env.NODE_ENV === 'development') {
                console.log(`[Notify] User ${member.userId} has ${subscriptions.length} push subscription(s)`);
            }

            if (subscriptions.length > 0) {
                const senderName = message.sender?.name || 'Utilisateur';
                const payload = JSON.stringify({
                    title: `${senderName}`,
                    body: 'Nouveau message',
                    icon: '/icons/icon-192x192.png',
                    url: `/chat/discussion/${conversationId}`,
                    type: 'message',
                    data: {
                        conversationId,
                        messageId: message.id,
                    }
                });

                const pushResults = await Promise.allSettled(subscriptions.map(async (sub) => {
                    try {
                        await sendPushNotification({
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth
                            }
                        }, payload);
                        if (process.env.NODE_ENV === 'development') {
                            console.log(`[Notify] Push sent to ${sub.endpoint.substring(0, 50)}...`);
                        }
                    } catch (err: any) {
                        console.error(`[Notify] Push failed for ${sub.endpoint.substring(0, 50)}:`, err.statusCode || err.message);
                        // Clean up dead subscriptions
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            if (process.env.NODE_ENV === 'development') {
                                console.log(`[Notify] Removing dead subscription: ${sub.endpoint.substring(0, 50)}`);
                            }
                            await prisma.pushSubscription.delete({
                                where: { endpoint: sub.endpoint }
                            }).catch(() => {});
                        }
                    }
                }));
            }
        } catch (pushError) {
            console.error('[Notify] Failed to send push notifications:', pushError);
        }
    });

    await Promise.all(notificationPromises);
}

/**
 * Send call notification to a user via Pusher + Web Push
 * The Web Push is critical for calls - it's how the phone rings when the app is closed!
 */
export async function notifyIncomingCall(
    recipientId: string,
    callerId: string,
    callerName: string,
    offer: any,
    conversationId: string
) {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Call] Notifying ${recipientId} of incoming call from ${callerName}`);
    }

    // Send via Pusher (real-time, if user is online in-app)
    try {
        await emitToUser(recipientId, 'call:incoming', {
            callerId,
            callerName,
            offer,
            conversationId,
        });
        if (process.env.NODE_ENV === 'development') console.log('[Call] Pusher call:incoming sent');
    } catch (err) {
        console.error('[Call] Error sending call via Pusher:', err);
    }

    // Send Web Push (CRITICAL: this is how the phone rings when app is closed!)
    try {
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId: recipientId }
        });

        if (process.env.NODE_ENV === 'development') {
            console.log(`[Call] Recipient has ${subscriptions.length} push subscription(s)`);
        }

        if (subscriptions.length > 0) {
            const payload = JSON.stringify({
                title: `Appel de ${callerName}`,
                body: 'Appuyez pour repondre',
                icon: '/icons/icon-192x192.png',
                url: `/chat/discussion/${conversationId}`,
                type: 'call',
                data: {
                    conversationId,
                    callerId,
                }
            });

            await Promise.allSettled(subscriptions.map(async (sub) => {
                try {
                    await sendPushNotification({
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth }
                    }, payload);
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`[Call] Push sent to ${sub.endpoint.substring(0, 50)}...`);
                    }
                } catch (err: any) {
                    console.error(`[Call] Push failed:`, err.statusCode || err.message);
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await prisma.pushSubscription.delete({
                            where: { endpoint: sub.endpoint }
                        }).catch(() => {});
                    }
                }
            }));
        } else {
            console.warn(`[Call] No push subscriptions for recipient ${recipientId} - call won't ring if app is closed`);
        }
    } catch (pushError) {
        console.error('[Call] Failed to send call push notification:', pushError);
    }
}
