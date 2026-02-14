import webpush from 'web-push';

const VAPID_SET =
    Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

if (VAPID_SET) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@chatkephale.com',
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!
    );
} else {
    console.warn(
        '[Push] Clés VAPID manquantes. Ajoutez VAPID_PRIVATE_KEY et NEXT_PUBLIC_VAPID_PUBLIC_KEY dans .env (générer avec: npx web-push generate-vapid-keys). Les notifications quand l\'app est fermée ne fonctionneront pas.'
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
    if (!VAPID_SET) {
        throw new Error(
            'Web Push: VAPID keys not set. Add VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY to env (generate with: npx web-push generate-vapid-keys).'
        );
    }
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
