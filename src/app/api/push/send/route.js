import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { sendPushToUser } from '@/lib/pushHelper';

// Send push notification to a user
export async function POST(request) {
    try {
        const { userId, title, body, tag, url } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const subscription = userDoc.data().pushSubscription;
        if (!subscription) {
            return NextResponse.json({ error: 'No push subscription' }, { status: 400 });
        }

        const success = await sendPushToUser(userId, subscription, { title, body, tag, url });
        if (success) {
            return NextResponse.json({ success: true });
        }
        return NextResponse.json({ error: 'Push failed' }, { status: 500 });

    } catch (error) {
        console.error('[Push Send] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
