import { NextResponse } from 'next/server';
import { validateSignature, replyMessage } from '@/lib/line';
import { db } from '@/lib/firebase/admin'; // Use Admin DB
import { FieldValue } from 'firebase-admin/firestore'; // For serverTimestamp

export async function POST(request) {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature');
    console.log("Debug: Webhook triggered");
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!channelSecret) {
        console.error("LINE_CHANNEL_SECRET is missing");
        return NextResponse.json({ error: 'Config error' }, { status: 500 });
    }

    console.log(`Debug: Secret detected (Length: ${channelSecret.length}, Starts with: ${channelSecret.substring(0, 4)})`);
    console.log(`Debug: Signature header: ${signature}`);
    console.log(`Debug: Body length: ${body.length}`);

    // SDK expects: validateSignature(body, channelSecret, signature)
    if (!validateSignature(body, channelSecret, signature)) {
        console.error("Signature validation FAILED");
        // Log calculated signature manually if needed for deep debug, but simple log first.
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }
    console.log("Signature validation PASSED");

    const events = JSON.parse(body).events;

    for (const event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
            await handleTextMessage(event);
        } else if (event.type === 'follow') {
            await handleFollowEvent(event);
        }
    }

    return NextResponse.json({ status: 'success' });
}

async function handleTextMessage(event) {
    const userId = event.source.userId;
    const text = event.message.text.trim();
    const replyToken = event.replyToken;

    // Check if it's a 6-digit link code
    if (/^\d{6}$/.test(text)) {
        // Attempt to link account
        const result = await linkUserAccount(text, userId);
        if (result.success) {
            await replyMessage(replyToken, {
                type: 'text',
                text: `連携しました！\nこんにちは、エレナです✨\nこれから毎日サポートしますね！💪`
            });
        } else {
            await replyMessage(replyToken, {
                type: 'text',
                text: `コードが見つからないか、有効期限切れです...😢\nアプリで新しいコードを発行してください。`
            });
        }
    } else {
        // Default AI reply (Optional - for now simple echo or ignore)
        // await replyMessage(replyToken, { type: 'text', text: 'メッセージありがとうございます！通知をお待ちください✨' });
    }
}

async function handleFollowEvent(event) {
    const replyToken = event.replyToken;
    await replyMessage(replyToken, {
        type: 'text',
        text: `友だち追加ありがとうございます！🎉\nLifelogアプリで発行した「6桁の数字」を送って、アカウントを連携してくださいね！`
    });
}

// Helper with Admin SDK
async function linkUserAccount(code, lineUserId) {
    try {
        console.log(`[Link] Attempting to link code: ${code} for LINE user: ${lineUserId}`);

        // Use Admin SDK syntax
        const snapshot = await db.collection('linkCodes').where('code', '==', code).limit(1).get();

        if (snapshot.empty) {
            console.log(`[Link] Code not found: ${code}`);
            return { success: false };
        }

        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        const appUserId = data.userId;

        console.log(`[Link] Found code for App User: ${appUserId}`);

        // Update User Profile with LINE ID
        await db.collection('users').doc(appUserId).update({
            lineUserId: lineUserId,
            lineLinkedAt: FieldValue.serverTimestamp()
        });

        console.log(`[Link] Updated user profile. Deleting code...`);

        // Delete used code
        await docSnap.ref.delete();

        return { success: true };
    } catch (e) {
        console.error("Link Error:", e);
        return { success: false };
    }
}
