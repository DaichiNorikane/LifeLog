import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getLineClient } from '@/lib/line';
import { evaluateDailyLog } from '@/app/actions/daily-evaluation';
import { sendPushToUser, getJSTToday } from '@/lib/pushHelper';

// Elena's random one-liners
const ELENA_HITOKOTO = [
    '明日の自分は、今日の選択で作られるよ✨',
    '完璧じゃなくていい。続けることが一番大事💪',
    '今日も記録してくれてありがとう！それだけで偉い🌟',
    '小さな積み重ねが、大きな変化になるからね🍀',
    '食べることは生きること。楽しんでいこ！🍽️',
    '無理しすぎないでね。あなたのペースでいいの😊',
    '昨日より1ミリでも前に進めたら、それは勝ちだよ🏆',
    '体は正直。ちゃんと記録してる人は必ず結果が出る📊',
    '今日の頑張りを、未来のあなたが褒めてくれるよ🌈',
    'エレナはいつでもあなたの味方だからね♪',
];

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Cron] Starting Daily Report...');
        const { todayStr } = getJSTToday();
        const dateKey = todayStr.replace(/-/g, '');

        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) return NextResponse.json({ message: 'No users' });

        const messagingApi = getLineClient();
        const results = [];

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();
            const lineUserId = userData.lineUserId;
            const pushSubscription = userData.pushSubscription;

            if (!lineUserId && !pushSubscription) continue;

            // --- Fetch today's data ---
            const startJST = new Date(`${todayStr}T00:00:00+09:00`);
            const endJST = new Date(`${todayStr}T23:59:59+09:00`);

            const mealsSnapshot = await db.collection('users').doc(userId).collection('meals')
                .where('timestamp', '>=', startJST.toISOString())
                .where('timestamp', '<=', endJST.toISOString())
                .get();

            const meals = mealsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            // --- 1. Daily Evaluation (only if meals exist) ---
            if (meals.length > 0) {
                const consumedCalories = meals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);
                const evaluation = await evaluateDailyLog({
                    date: todayStr,
                    consumedCalories,
                    targetCalories: userData.targetCalories || 2000,
                    meals,
                    currentWeight: userData.currentWeight,
                    targetWeight: userData.targetWeight,
                    targetDate: userData.targetDate,
                });

                if (!evaluation.error) {
                    await db.collection('users').doc(userId).collection('daily_evaluations').doc(dateKey).set({
                        ...evaluation,
                        createdAt: new Date().toISOString()
                    });

                    const text = `【${todayStr}の評価レポート by エレナ 🌙】\nスコア: ${evaluation.score}点\n判定: ${evaluation.title}\n\n${evaluation.reason || evaluation.advice}\n\n(自動配信: 明日も一緒に頑張りましょうね♪)`;

                    if (lineUserId) {
                        try {
                            await messagingApi.pushMessage({ to: lineUserId, messages: [{ type: 'text', text }] });
                        } catch (e) { console.error(`[Cron] LINE failed for ${userId}:`, e.message); }
                    }

                    if (pushSubscription) {
                        await sendPushToUser(userId, pushSubscription, {
                            title: `エレナの評価: ${evaluation.score}点 ${evaluation.title}`,
                            body: evaluation.reason || evaluation.advice,
                            tag: `daily-report-${todayStr}`,
                        });
                    }

                    results.push({ userId, score: evaluation.score });
                }
            }

            // --- 2. Weight Reminder (if no weight recorded today) ---
            if (pushSubscription) {
                const weightDoc = await db.collection('users').doc(userId).collection('weights').doc(todayStr).get();
                if (!weightDoc.exists) {
                    await sendPushToUser(userId, pushSubscription, {
                        title: 'エレナより📏',
                        body: '今日の体重、まだ記録してないみたい。寝る前にサクッと量っておこう！',
                        tag: `weight-reminder-${todayStr}`,
                    });
                }
            }

            // --- 3. Streak Celebration ---
            if (pushSubscription && meals.length > 0) {
                const streak = await calculateStreak(userId, todayStr);
                if (streak >= 3 && streak % 1 === 0) {
                    const streakMessages = {
                        3: '3日連続記録達成！いい調子じゃん✨ この勢いで続けよう！',
                        7: '1週間連続！すごいよ！🎉 習慣になってきたね！',
                        14: '2週間連続！もう立派な習慣だよ🏅',
                        30: '1ヶ月連続！！信じられない…感動してる😭✨',
                    };
                    // Notify at milestones: 3, 5, 7, 10, 14, 21, 30, then every 10
                    const milestones = [3, 5, 7, 10, 14, 21, 30];
                    const isMilestone = milestones.includes(streak) || (streak > 30 && streak % 10 === 0);
                    if (isMilestone) {
                        const body = streakMessages[streak] || `${streak}日連続記録！あなたの継続力、本当にすごい💪✨`;
                        await sendPushToUser(userId, pushSubscription, {
                            title: `🔥 ${streak}日連続記録達成！`,
                            body,
                            tag: `streak-${todayStr}`,
                        });
                    }
                }
            }

            // --- 4. Elena's Random Hitokoto ---
            if (pushSubscription && meals.length > 0) {
                // Send ~50% of the time to keep it fresh and not annoying
                if (Math.random() < 0.5) {
                    const msg = ELENA_HITOKOTO[Math.floor(Math.random() * ELENA_HITOKOTO.length)];
                    await sendPushToUser(userId, pushSubscription, {
                        title: 'エレナの一言 💬',
                        body: msg,
                        tag: `hitokoto-${todayStr}`,
                    });
                }
            }
        }

        return NextResponse.json({ success: true, processed: results.length });
    } catch (error) {
        console.error('[Cron] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * Calculate consecutive days of meal recording (streak).
 */
async function calculateStreak(userId, todayStr) {
    let streak = 0;
    const date = new Date(todayStr + 'T12:00:00+09:00');

    for (let i = 0; i < 60; i++) {
        const checkDate = new Date(date);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        const startJST = new Date(`${dateStr}T00:00:00+09:00`);
        const endJST = new Date(`${dateStr}T23:59:59+09:00`);

        const snapshot = await db.collection('users').doc(userId).collection('meals')
            .where('timestamp', '>=', startJST.toISOString())
            .where('timestamp', '<=', endJST.toISOString())
            .limit(1)
            .get();

        if (snapshot.empty) break;
        streak++;
    }

    return streak;
}
