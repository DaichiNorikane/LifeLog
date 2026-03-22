import { NextResponse } from 'next/server';
import { validateSignature, replyMessage } from '@/lib/line';
import { db } from '@/lib/firebase/admin'; // Use Admin DB
import { FieldValue } from 'firebase-admin/firestore'; // For serverTimestamp
import { suggestNextMeal } from '@/app/actions/meal-advisor';

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

    // Meal Proposal Keywords
    const MEAL_KEYWORDS = {
        '朝食': 'breakfast',
        '昼食': 'lunch',
        '夕食': 'dinner'
    };

    if (MEAL_KEYWORDS[text]) {
        const targetType = MEAL_KEYWORDS[text];

        // 1. Get User
        const usersSnapshot = await db.collection('users').where('lineUserId', '==', userId).limit(1).get();
        if (usersSnapshot.empty) {
            await replyMessage(replyToken, {
                type: 'text',
                text: `まずはアカウント連携をお願いします！\nアプリで発行した「6桁の数字」を送ってくださいね。`
            });
            return;
        }

        const userDoc = usersSnapshot.docs[0];
        const userData = userDoc.data();
        const appUserId = userDoc.id;

        // 2. Simulate Thinking (Delay)
        // 2 seconds delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Fetch Data (Meals & Stock)
        const now = new Date();
        const jstOffset = 9 * 60;
        const jstNow = new Date(now.getTime() + (jstOffset * 60 * 1000));
        const todayStr = jstNow.toISOString().split('T')[0];

        const startJST = new Date(`${todayStr}T00:00:00+09:00`);
        const endJST = new Date(`${todayStr}T23:59:59+09:00`);

        try {
            const [mealsSnap, stockSnap] = await Promise.all([
                db.collection('users').doc(appUserId).collection('meals')
                    .where('timestamp', '>=', startJST.toISOString())
                    .where('timestamp', '<=', endJST.toISOString())
                    .get(),
                db.collection('users').doc(appUserId).collection('stockItems').get()
            ]);

            const meals = mealsSnap.docs.map(d => d.data());
            const stockItems = stockSnap.docs.map(d => ({ name: d.data().name }));

            // 4. Calculate Calories
            const consumedCalories = meals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);
            const dailyLog = {
                totalCalories: consumedCalories,
                targetCalories: userData.targetCalories || 2200
            };

            // 5. Generate Suggestion
            const result = await suggestNextMeal(meals, dailyLog, targetType, stockItems);

            // 6. Reply
            // Format: Advice + Top 3 suggestions
            const topSuggestions = (result.suggestions || []).slice(0, 3);
            let suggestionText = topSuggestions.map(s => `・${s.name}\n  (${s.reason})`).join('\n');

            if (!suggestionText) suggestionText = "（すみません、良いメニューが思いつきませんでした...💦）";

            const replyText = `${result.advice}\n\n【おすすめメニュー】\n${suggestionText}`;

            await replyMessage(replyToken, {
                type: 'text',
                text: replyText
            });

        } catch (e) {
            console.error("Suggestion Error:", e);
            await replyMessage(replyToken, {
                type: 'text',
                text: `ごめんなさい、うまく考えられませんでした...😢\n少し時間を置いてから、もう一度試してみてください。`
            });
        }
        return;
    }

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
