import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import webpush from 'web-push';

// Configure VAPID (lazy - only when keys are available)
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

// Send push notification to a user
export async function POST(request) {
    try {
        if (!ensureVapid()) {
            return NextResponse.json({ error: 'VAPID not configured' }, { status: 503 });
        }

        const { userId, title, body, tag, url } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        // Get user's push subscription
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const subscription = userDoc.data().pushSubscription;
        if (!subscription) {
            return NextResponse.json({ error: 'No push subscription' }, { status: 400 });
        }

        const payload = JSON.stringify({
            title: title || 'LifeLog',
            body: body || 'エレナからのお知らせ',
            tag: tag || 'lifelog-notification',
            url: url || '/',
        });

        await webpush.sendNotification(subscription, payload);
        return NextResponse.json({ success: true });

    } catch (error) {
        // Subscription expired or invalid
        if (error.statusCode === 410 || error.statusCode === 404) {
            console.warn('[Push] Subscription expired, cleaning up');
            try {
                const { userId } = await request.clone().json();
                const { FieldValue } = await import('firebase-admin/firestore');
                await db.collection('users').doc(userId).update({
                    pushSubscription: FieldValue.delete(),
                });
            } catch {}
            return NextResponse.json({ error: 'Subscription expired' }, { status: 410 });
        }

        console.error('[Push Send] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
