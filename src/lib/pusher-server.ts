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
 * Payload allégé pour message:new (Pusher limite 10 240 bytes).
 * Exclut les données base64 des pièces jointes — le client fetch le message complet si besoin.
 */
function buildLightweightMessagePayload(message: any, conversationId: string) {
    const attachmentsMeta = (message.attachments ?? []).map((a: any) => ({
        filename: a.filename,
        type: a.type,
    }));

    const pusherPayload = {
        conversationId,
        message: {
            id: message.id,
            content: message.content,
            senderId: message.senderId,
            sender: message.sender
                ? { id: message.sender.id, name: message.sender.name, publicKey: message.sender.publicKey }
                : null,
            createdAt: message.createdAt instanceof Date
                ? message.createdAt.toISOString()
                : message.createdAt,
            updatedAt: message.updatedAt instanceof Date
                ? message.updatedAt.toISOString()
                : message.updatedAt,
            isEdited: message.isEdited ?? false,
            replyTo: message.replyTo ?? null,
            hasAttachments: attachmentsMeta.length > 0,
            attachmentsMeta,
        },
    };

    const payloadSize = Buffer.byteLength(JSON.stringify(pusherPayload), 'utf8');
    if (payloadSize > 9500) {
        pusherPayload.message.content = pusherPayload.message.content?.substring(0, 500) ?? '';
    }

    return pusherPayload;
}

/**
 * Broadcast message:new avec payload allégé (évite erreur 413 Pusher).
 */
export async function emitMessageNewToConversation(conversationId: string, message: any) {
    const payload = buildLightweightMessagePayload(message, conversationId);
    await emitToConversation(conversationId, 'message:new', payload);
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
