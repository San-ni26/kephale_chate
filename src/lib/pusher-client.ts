/**
 * Pusher Client Instance (Singleton)
 * Used in React components to subscribe to real-time events.
 * Works everywhere including Vercel serverless deployments.
 * 
 * IMPORTANT: This is a TRUE singleton - the same Pusher instance and channels
 * are shared across all components. Only the first subscriber creates the connection,
 * and only the last unsubscriber disconnects.
 */
'use client';

import PusherClient from 'pusher-js';
import type { Channel } from 'pusher-js';
import { getToken, getUser } from '@/src/lib/auth-client';

let pusherClientInstance: PusherClient | null = null;
let userChannelInstance: Channel | null = null;
let userChannelRefCount = 0;

export function getPusherClient(): PusherClient | null {
    if (typeof window === 'undefined') return null;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
        if (process.env.NODE_ENV === 'development') {
            console.error('[Pusher] Missing env vars: NEXT_PUBLIC_PUSHER_KEY, NEXT_PUBLIC_PUSHER_CLUSTER');
        }
        return null;
    }

    if (pusherClientInstance) {
        return pusherClientInstance;
    }

    // Enable Pusher debug logging in development only
    if (process.env.NODE_ENV === 'development') {
        PusherClient.logToConsole = true;
        console.log('[Pusher] Initializing client - key:', key?.substring(0, 6) + '...', 'cluster:', cluster);
    }

    try {
        pusherClientInstance = new PusherClient(key, {
            cluster,
            // Garder la connexion plus longtemps avant déconnexion pour inactivité (défaut 120s)
            activityTimeout: 300000, // 5 min (ms)
            channelAuthorization: {
                transport: 'ajax',
                endpoint: '/api/pusher/auth',
                headersProvider: () => ({
                    Authorization: `Bearer ${getToken() || ''}`,
                }),
            },
        });
    } catch (err) {
        if (process.env.NODE_ENV === 'development') {
            console.error('[Pusher] Failed to create client:', err);
        }
        return null;
    }

    return pusherClientInstance;
}

/**
 * Get or create the user's private channel (ref-counted singleton).
 * Multiple components can share the same channel.
 * Call releaseUserChannel() when done.
 */
export function acquireUserChannel(): Channel | null {
    const client = getPusherClient();
    if (!client) return null;

    const user = getUser();
    if (!user) return null;

    userChannelRefCount++;

    if (userChannelInstance) {
        return userChannelInstance;
    }

    const channelName = `private-user-${user.id}`;
    userChannelInstance = client.subscribe(channelName);

    userChannelInstance.bind('pusher:subscription_succeeded', () => {
        if (process.env.NODE_ENV === 'development') {
            console.log('[Pusher] Subscribed to user channel:', channelName);
        }
    });

    userChannelInstance.bind('pusher:subscription_error', (err: any) => {
        console.error('[Pusher] User channel subscription error:', err);
    });

    return userChannelInstance;
}

/**
 * Release a ref to the user channel. When all refs are released,
 * the channel is unsubscribed.
 */
export function releaseUserChannel(): void {
    userChannelRefCount = Math.max(0, userChannelRefCount - 1);

    if (userChannelRefCount === 0 && userChannelInstance && pusherClientInstance) {
        const user = getUser();
        if (user) {
            userChannelInstance.unbind_all();
            pusherClientInstance.unsubscribe(`private-user-${user.id}`);
        }
        userChannelInstance = null;
    }
}

/**
 * Get the current user channel without modifying ref count (read-only peek).
 */
export function getUserChannel(): Channel | null {
    return userChannelInstance;
}

/**
 * Disconnect and cleanup the Pusher client.
 * Call this on logout.
 */
export function disconnectPusher() {
    if (pusherClientInstance) {
        pusherClientInstance.disconnect();
        pusherClientInstance = null;
    }
    userChannelInstance = null;
    userChannelRefCount = 0;
}

/**
 * Force reconnect (useful after token refresh)
 */
export function reconnectPusher() {
    if (pusherClientInstance) {
        pusherClientInstance.disconnect();
        pusherClientInstance.connect();
    }
}
