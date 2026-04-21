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
            timeout: 5000, // Timeout de 5 secondes
        });
    }
    return pusherInstance;
}

// ---- Helper functions ----

/**
 * Retry wrapper for Pusher operations
 */
async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            console.warn(`[Pusher] Attempt ${attempt + 1}/${maxRetries} failed:`, lastError.message);
            
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
            }
        }
    }
    
    throw lastError;
}

/**
 * Send an event to a user's private channel
 */
export async function emitToUser(userId: string, event: string, data: any) {
    return withRetry(async () => {
        const pusher = getPusher();
        await pusher.trigger(`private-user-${userId}`, event, data);
    }, 3, 500);
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
 * Depuis la migration Supabase, les pièces jointes sont des URLs courtes (https://...)
 * et non plus des base64 lourds → on peut les inclure directement dans le payload.
 * Les anciens base64 (legacy) sont exclus pour éviter l'erreur 413.
 */
function buildLightweightMessagePayload(message: any, conversationId: string) {
    // Inclure les données des pièces jointes seulement si ce sont des URLs Supabase (courtes)
    // Exclure les base64 legacy qui dépasseraient la limite Pusher
    const attachments = (message.attachments ?? []).map((a: any) => {
        const isSupabaseUrl = typeof a.data === 'string' && a.data.startsWith('https://');
        return {
            filename: a.filename,
            type: a.type,
            // Inclure le data seulement si c'est une URL Supabase (court), pas un base64 lourd
            data: isSupabaseUrl ? a.data : undefined,
            storageKey: a.storageKey,
        };
    });

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
            hasAttachments: attachments.length > 0,
            attachments,
        },
    };

    const payloadSize = Buffer.byteLength(JSON.stringify(pusherPayload), 'utf8');
    if (payloadSize > 9500) {
        // Si toujours trop lourd (cas edge), tronquer le contenu texte
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

/**
 * Vérifie si un utilisateur est actuellement dans le channel de presence d'une conversation.
 *
 * Si oui → l'app est ouverte sur la page de discussion → Pusher livre le message
 * en temps réel → inutile d'envoyer un push Web (qui arriverait en double).
 *
 * Utilisé dans websocket.ts (notifyNewMessage) avant d'appeler sendPushNotification.
 */
export async function isUserInConversationChannel(userId: string, conversationId: string): Promise<boolean> {
    try {
        const pusher = getPusher();
        const channelName = `presence-conversation-${conversationId}`;
        const channelInfo = await pusher.get({ path: `/channels/${channelName}/users` });
        if (!channelInfo || channelInfo.status !== 200) return false;
        const body = await channelInfo.json() as { users?: { id: string }[] };
        const users: { id: string }[] = body?.users ?? [];
        return users.some((u) => u.id === userId);
    } catch {
        // Channel inexistant, erreur réseau ou Pusher indisponible → ne pas bloquer le push
        return false;
    }
}
