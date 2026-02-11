
import webpush from 'web-push';

if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    console.warn('VAPID keys must be set for web push notifications.');
} else {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@chatkephale.com',
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

export interface PushSubscriptionData {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

export async function sendPushNotification(subscription: PushSubscriptionData, payload: string | object) {
    try {
        const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

        await webpush.sendNotification(
            {
                endpoint: subscription.endpoint,
                keys: subscription.keys,
            },
            payloadString,
            {
                // Livraison immédiate même quand le navigateur est fermé
                urgency: 'high',
                // TTL 24h - délai max pour garder la push (FCM peut ignorer)
                TTL: 86400,
            }
        );

        return { success: true };
    } catch (error) {
        console.error('Error sending push notification:', error);
        // Typically remove invalid subscriptions here or return error code
        throw error;
    }
}
