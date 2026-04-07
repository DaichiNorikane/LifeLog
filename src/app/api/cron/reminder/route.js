import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getJSTToday, sendPushWithLimit, getTodayMeals, getOrRunEvaluation } from '@/lib/pushHelper';

// Breakfast-focused reminder messages (no prior meals)
const ELENA_MESSAGES = [
    { title: 'エレナだよ〜🍎', body: '朝ごはんの記録まだ？食べたならサクッと入れちゃお！' },
    { title: 'ちょっと！📝', body: '午前中の食事、記録してないみたい？忘れないうちにね♪' },
    { title: 'エレナより💪', body: '朝食の記録が大事なの！まだなら今のうちに入れておこう！' },
    { title: 'リマインド！🔔', body: '朝ごはん食べた？食べてないなら…ちゃんと食べてね？記録も忘れずに！' },
    { title: 'エレナです😊', body: '記録を続けるのが大事なの！午前中の分、サクッと入れちゃお？' },
];

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Reminder] Starting breakfast reminder...');
        const { todayStr } = getJSTToday();

        // Get yesterday's date for evaluation reference
        const yesterday = new Date(todayStr + 'T12:00:00+09:00');
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const yesterdayKey = yesterdayStr.replace(/-/g, '');

        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) return NextResponse.json({ message: 'No users' });

        let sent = 0;

        for (const doc of usersSnapshot.docs) {
            const userId = doc.id;
            const userData = doc.data();
            const subscription = userData.pushSubscription;
            if (!subscription) continue;

            const meals = await getTodayMeals(userId, todayStr);

            // Check if any morning meal (5:00-11:00 JST) is recorded
            const hasMorning = meals.some(m => {
                const hour = (new Date(m.timestamp).getUTCHours() + 9) % 24;
                return hour >= 5 && hour < 11;
            });

            // Only remind if no morning meal recorded
            if (!hasMorning) {
                // Check yesterday's evaluation for personalized message
                const evalDoc = await db.collection('users').doc(userId)
                    .collection('daily_evaluations').doc(yesterdayKey).get();

                let title, body;
                if (evalDoc.exists) {
                    const evalData = evalDoc.data();
                    const score = evalData.score || 0;
                    if (score >= 70) {
                        title = 'エレナだよ〜🍎';
                        body = `昨日は${score}点✨いい調子！朝ごはんの記録でさらに加速しよ♪`;
                    } else {
                        title = 'エレナより💪';
                        body = `昨日は${score}点だったね。朝食をしっかり記録して今日は巻き返そう！`;
                    }
                } else {
                    const msg = ELENA_MESSAGES[Math.floor(Math.random() * ELENA_MESSAGES.length)];
                    title = msg.title;
                    body = msg.body;
                }

                const success = await sendPushWithLimit(userId, subscription, todayStr, 'reminder', {
                    title,
                    body,
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
