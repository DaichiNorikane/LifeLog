import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getJSTToday, sendPushWithLimit, getTodayMeals, getOrRunEvaluation } from '@/lib/pushHelper';

const MESSAGES_NO_LUNCH = [
    { title: 'エレナだよ🍱', body: 'ランチの記録まだかな？忘れないうちにサクッと入れちゃお！' },
    { title: 'ちょっと！📝', body: 'お昼ご飯食べた？記録、待ってるからね♪' },
    { title: 'リマインド🔔', body: '午後も頑張るために、まずはランチの記録からっ！' },
];

const MESSAGES_NONE = [
    { title: 'エレナです😊', body: '今日まだ何も記録してないよ？朝昼まとめてでもOKだから！' },
    { title: 'ねえねえ📱', body: '今日の記録ゼロだよ…？忙しくてもサクッと入れてね！' },
    { title: 'エレナより💪', body: '朝もお昼もまだ未記録！まとめて記録しちゃおう♪' },
];

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Afternoon Check] Starting...');
        const { todayStr } = getJSTToday();

        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) return NextResponse.json({ message: 'No users' });

        let sent = 0;

        for (const doc of usersSnapshot.docs) {
            const userId = doc.id;
            const userData = doc.data();
            const subscription = userData.pushSubscription;
            if (!subscription) continue;

            const meals = await getTodayMeals(userId, todayStr);

            // Classify meals by time
            const hasAfternoon = meals.some(m => {
                const hour = (new Date(m.timestamp).getUTCHours() + 9) % 24;
                return hour >= 11 && hour < 16;
            });

            // Skip if lunch already recorded
            if (hasAfternoon) continue;

            let title, body;

            if (meals.length > 0) {
                // Has breakfast but no lunch → run evaluation and personalize
                const evaluation = await getOrRunEvaluation(userId, todayStr, meals, userData);
                if (evaluation && typeof evaluation.score === 'number') {
                    const consumed = meals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);
                    const target = userData.targetCalories || 2000;
                    const remaining = target - consumed;
                    title = `午前は${evaluation.score}点📊`;
                    body = `ここまで${consumed}kcal。残り${remaining}kcalだよ！ランチの記録もよろしくね♪`;
                } else {
                    const msg = pickRandom(MESSAGES_NO_LUNCH);
                    title = msg.title;
                    body = msg.body;
                }
            } else {
                const msg = pickRandom(MESSAGES_NONE);
                title = msg.title;
                body = msg.body;
            }

            const success = await sendPushWithLimit(userId, subscription, todayStr, 'afternoon-check', {
                title,
                body,
                tag: `afternoon-check-${todayStr}`,
            });
            if (success) sent++;
        }

        return NextResponse.json({ success: true, sent });
    } catch (error) {
        console.error('[Afternoon Check] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
