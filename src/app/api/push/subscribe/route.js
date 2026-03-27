import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';

// Save push subscription to Firestore
export async function POST(request) {
    try {
        const { userId, subscription } = await request.json();

        if (!userId || !subscription) {
            return NextResponse.json({ error: 'Missing userId or subscription' }, { status: 400 });
        }

        // Save subscription under user doc
        await db.collection('users').doc(userId).set({
            pushSubscription: subscription,
            pushSubscribedAt: new Date().toISOString(),
        }, { merge: true });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Push Subscribe] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Delete push subscription
export async function DELETE(request) {
    try {
        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const { FieldValue } = await import('firebase-admin/firestore');
        await db.collection('users').doc(userId).update({
            pushSubscription: FieldValue.delete(),
            pushSubscribedAt: FieldValue.delete(),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Push Unsubscribe] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
