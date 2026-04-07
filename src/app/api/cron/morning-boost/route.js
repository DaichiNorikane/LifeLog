import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getJSTToday, sendPushWithLimit } from '@/lib/pushHelper';

const MESSAGES_GOOD = [
    { title: 'おはよ！🌅', body: '昨日は{score}点！素晴らしい✨ 今日も{target}kcal目標で頑張ろ！' },
    { title: 'エレナです☀️', body: '昨日{score}点のいい調子！今日の目標は{target}kcal。この波に乗っていこ🔥' },
    { title: 'グッドモーニング💪', body: '昨日の{score}点、さすがだね！今日も{target}kcalでいい1日にしよ！' },
];

const MESSAGES_NORMAL = [
    { title: 'おはよ〜🌞', body: '今日も新しい1日！目標{target}kcalでいってみよう💪' },
    { title: 'エレナだよ☀️', body: '昨日は{score}点だったね。今日は{target}kcal目標で巻き返そ！' },
    { title: '朝ですよ〜🔔', body: '昨日の反省を活かして、今日は{target}kcal。きっとできるよ✨' },
];

const MESSAGES_MISS = [
    { title: 'おはよう😊', body: '昨日は忙しかったかな？今日はリセット日！{target}kcal目標でいこう♪' },
    { title: 'エレナより💕', body: '記録ない日もあるよ！大事なのは今日。{target}kcalでスタートしよう🍀' },
    { title: '新しい朝！🌈', body: '昨日はお休みだったね。今日から再開！{target}kcal目指そう！' },
];

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function formatMessage(msg, score, target) {
    return {
        title: msg.title,
        body: msg.body.replace('{score}', score).replace('{target}', target),
    };
}

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Morning Boost] Starting...');
        const { todayStr } = getJSTToday();

        // Get yesterday's date
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

            const target = userData.targetCalories || 2000;

            // Check yesterday's evaluation
            const evalDoc = await db.collection('users').doc(userId)
                .collection('daily_evaluations').doc(yesterdayKey).get();

            let messages;
            let score = '';
            let evalAdvice = '';
            if (evalDoc.exists) {
                const evalData = evalDoc.data();
                score = evalData.score || 0;
                evalAdvice = evalData.advice || evalData.reason || '';
                messages = score >= 70 ? MESSAGES_GOOD : MESSAGES_NORMAL;
            } else {
                messages = MESSAGES_MISS;
            }

            let msg;
            if (evalAdvice && score) {
                // Use evaluation advice for a more personalized message
                const adviceSnippet = evalAdvice.slice(0, 60);
                msg = {
                    title: score >= 70 ? `昨日${score}点✨おはよ！` : `昨日${score}点、今日はリベンジ💪`,
                    body: `${adviceSnippet}… 今日の目標は${target}kcal！`,
                };
            } else {
                msg = formatMessage(pickRandom(messages), score, target);
            }
            const success = await sendPushWithLimit(userId, subscription, todayStr, 'morning-boost', {
                title: msg.title,
                body: msg.body,
                tag: `morning-boost-${todayStr}`,
            });
            if (success) sent++;
        }

        return NextResponse.json({ success: true, sent });
    } catch (error) {
        console.error('[Morning Boost] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
