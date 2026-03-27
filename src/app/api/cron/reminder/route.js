import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { sendPushToUser, getJSTToday } from '@/lib/pushHelper';

// Elena's random messages
const ELENA_MESSAGES = [
    { title: 'エレナだよ〜🍎', body: '今日のお昼ちゃんと食べた？記録しておこうね！' },
    { title: 'ちょっと！📝', body: 'お昼の記録まだじゃない？忘れないうちにね♪' },
    { title: 'エレナより💪', body: '午後も頑張るために、まずはランチの記録からっ！' },
    { title: 'リマインド！🔔', body: 'お昼ご飯の記録、まだみたいだけど…食べてないの？ちゃんと食べてね？' },
    { title: 'エレナです😊', body: '記録を続けるのが大事なの！お昼の分、サクッと入れちゃお？' },
];

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Reminder] Starting lunch reminder...');
        const { todayStr } = getJSTToday();

        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) return NextResponse.json({ message: 'No users' });

        let sent = 0;

        for (const doc of usersSnapshot.docs) {
            const userId = doc.id;
            const userData = doc.data();
            const subscription = userData.pushSubscription;
            if (!subscription) continue;

            // Check if user has logged any meal today
            const startJST = new Date(`${todayStr}T00:00:00+09:00`);
            const endJST = new Date(`${todayStr}T23:59:59+09:00`);

            const mealsSnapshot = await db.collection('users').doc(userId).collection('meals')
                .where('timestamp', '>=', startJST.toISOString())
                .where('timestamp', '<=', endJST.toISOString())
                .limit(1)
                .get();

            // Only remind if NO meals recorded today
            if (mealsSnapshot.empty) {
                const msg = ELENA_MESSAGES[Math.floor(Math.random() * ELENA_MESSAGES.length)];
                const success = await sendPushToUser(userId, subscription, {
                    title: msg.title,
                    body: msg.body,
                    tag: `meal-reminder-${todayStr}`,
                });
                if (success) sent++;
            }
        }

        return NextResponse.json({ success: true, sent });
    } catch (error) {
        console.error('[Reminder] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
