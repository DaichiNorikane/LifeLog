import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getJSTToday, sendPushWithLimit, getTodayMeals, getOrRunEvaluation } from '@/lib/pushHelper';

const MESSAGES_NO_LUNCH = [
    { title: 'エレナです🍱', body: 'ランチの記録はまだですか？忘れないうちにサクッと入れちゃいましょう！' },
    { title: 'ちょっと！📝', body: 'お昼ご飯は食べましたか？記録、待っていますからね♪' },
    { title: 'リマインド🔔', body: '午後も頑張るために、まずはランチの記録からです！' },
];

const MESSAGES_NONE = [
    { title: 'エレナです😊', body: '今日はまだ何も記録していませんよ？朝昼まとめてでもOKですから！' },
    { title: 'ねえねえ📱', body: '今日の記録がゼロですよ…？忙しくてもサクッと入れてくださいね！' },
    { title: 'エレナより💪', body: '朝もお昼もまだ未記録です！まとめて記録しちゃいましょう♪' },
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
                    body = `ここまで${consumed}kcal。残り${remaining}kcalです！ランチの記録もよろしくお願いしますね♪`;
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
