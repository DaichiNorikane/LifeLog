import webpush from 'web-push';
import { db } from '@/lib/firebase/admin';

let vapidConfigured = false;

function ensureVapid() {
    if (vapidConfigured) return true;
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
            'mailto:noreply@lifelog.app',
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
        vapidConfigured = true;
        return true;
    }
    return false;
}

/**
 * Send a Web Push notification to a user.
 * Automatically cleans up expired subscriptions.
 */
export async function sendPushToUser(userId, subscription, { title, body, tag, url }) {
    if (!subscription || !ensureVapid()) return false;

    try {
        const payload = JSON.stringify({
            title: title || 'LifeLog',
            body: (body || '').slice(0, 200),
            tag: tag || 'lifelog-notification',
            url: url || '/',
        });
        await webpush.sendNotification(subscription, payload);
        return true;
    } catch (err) {
        console.error(`[Push] Failed for ${userId}:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
            const { FieldValue } = await import('firebase-admin/firestore');
            await db.collection('users').doc(userId).update({
                pushSubscription: FieldValue.delete(),
            }).catch(() => {});
        }
        return false;
    }
}

/**
 * Get JST date helpers
 */
export function getJSTToday() {
    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const todayStr = jstNow.toISOString().split('T')[0];
    return { jstNow, todayStr };
}
