/**
 * Pusher Server Instance
 * Used in API routes and server-side code to trigger events.
 * Works in serverless environments (Vercel, etc.)
 */
import Pusher from 'pusher';

let pusherInstance: Pusher | null = null;

export function getPusher(): Pusher {
    if (!pusherInstance) {
        const appId = process.env.PUSHER_APP_ID;
        const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
        const secret = process.env.PUSHER_SECRET;
        const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

        if (!appId || !key || !secret || !cluster) {
            throw new Error(
                'Missing Pusher environment variables. Required: PUSHER_APP_ID, NEXT_PUBLIC_PUSHER_KEY, PUSHER_SECRET, NEXT_PUBLIC_PUSHER_CLUSTER'
            );
        }

        pusherInstance = new Pusher({
            appId,
            key,
            secret,
            cluster,
            useTLS: true,
        });
    }
    return pusherInstance;
}

// ---- Helper functions ----

/**
 * Send an event to a user's private channel
 */
export async function emitToUser(userId: string, event: string, data: any) {
    const pusher = getPusher();
    await pusher.trigger(`private-user-${userId}`, event, data);
}

/**
 * Send an event to a conversation channel
 */
export async function emitToConversation(conversationId: string, event: string, data: any) {
    const pusher = getPusher();
    await pusher.trigger(`presence-conversation-${conversationId}`, event, data);
}

/**
 * Send an event to multiple channels at once (max 100)
 */
export async function emitToMultipleUsers(userIds: string[], event: string, data: any) {
    const pusher = getPusher();
    const channels = userIds.map(id => `private-user-${id}`);

    // Pusher allows max 100 channels per trigger
    const chunks = [];
    for (let i = 0; i < channels.length; i += 100) {
        chunks.push(channels.slice(i, i + 100));
    }

    await Promise.all(
        chunks.map(chunk => pusher.trigger(chunk, event, data))
    );
}
