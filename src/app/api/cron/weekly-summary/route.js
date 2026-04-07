import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getLineClient } from '@/lib/line';
import { sendPushToUser, getJSTToday } from '@/lib/pushHelper';

const ELENA_WEEKLY_COMMENTS = {
    perfect: [
        '7日全部記録！完璧すぎない！？もう習慣マスターだよ✨',
        'パーフェクト記録！エレナ感動してる…来週も一緒に頑張ろ😭✨',
    ],
    great: [
        'すごい！ほぼ毎日記録できてるじゃん！あと少しでパーフェクト🔥',
        'いい感じ！この調子で来週はもっといけるよ💪',
    ],
    good: [
        '半分以上記録できたね！少しずつ増やしていこう🍀',
        'まずまず！来週はあと1日多く記録してみない？😊',
    ],
    low: [
        '今週はちょっと少なかったね。でも大丈夫、来週リセットだよ！',
        '忙しかったかな？来週は1日でも多く記録できるといいな♪',
    ],
};

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getWeeklyComment(recordDays) {
    if (recordDays === 7) return pickRandom(ELENA_WEEKLY_COMMENTS.perfect);
    if (recordDays >= 5) return pickRandom(ELENA_WEEKLY_COMMENTS.great);
    if (recordDays >= 3) return pickRandom(ELENA_WEEKLY_COMMENTS.good);
    return pickRandom(ELENA_WEEKLY_COMMENTS.low);
}

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Weekly Summary] Starting...');
        const { todayStr } = getJSTToday();

        // Calculate week range (last 7 days: Mon-Sun)
        const today = new Date(todayStr + 'T12:00:00+09:00');
        const weekDates = [];
        for (let i = 7; i >= 1; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            weekDates.push(d.toISOString().split('T')[0]);
        }
        const weekStart = weekDates[0];
        const weekEnd = weekDates[weekDates.length - 1];

        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) return NextResponse.json({ message: 'No users' });

        const messagingApi = getLineClient();
        let sent = 0;

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();
            const lineUserId = userData.lineUserId;
            const pushSubscription = userData.pushSubscription;

            if (!lineUserId && !pushSubscription) continue;

            // Collect daily evaluations for the week
            let recordDays = 0;
            let totalScore = 0;
            let scoreCount = 0;

            for (const dateStr of weekDates) {
                const dateKey = dateStr.replace(/-/g, '');
                const evalDoc = await db.collection('users').doc(userId)
                    .collection('daily_evaluations').doc(dateKey).get();
                if (evalDoc.exists) {
                    recordDays++;
                    const score = evalDoc.data().score;
                    if (score != null) {
                        totalScore += score;
                        scoreCount++;
                    }
                }
            }

            // Skip if no records this week
            if (recordDays === 0) continue;

            const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : '-';

            // Weight change
            let weightText = '';
            const startWeightDoc = await db.collection('users').doc(userId)
                .collection('weights').doc(weekStart).get();
            const endWeightDoc = await db.collection('users').doc(userId)
                .collection('weights').doc(weekEnd).get();
            if (startWeightDoc.exists && endWeightDoc.exists) {
                const startW = startWeightDoc.data().weight;
                const endW = endWeightDoc.data().weight;
                const diff = (endW - startW).toFixed(1);
                const sign = diff > 0 ? '+' : '';
                weightText = `\n体重: ${startW}kg → ${endW}kg (${sign}${diff}kg)`;
            }

            const comment = getWeeklyComment(recordDays);

            const text = `【週間レポート by エレナ 📊】\n期間: ${weekStart} 〜 ${weekEnd}\n記録日数: ${recordDays}/7日\n平均スコア: ${avgScore}点${weightText}\n\nエレナ: ${comment}`;

            // Send via LINE
            if (lineUserId) {
                try {
                    await messagingApi.pushMessage({
                        to: lineUserId,
                        messages: [{ type: 'text', text }],
                    });
                } catch (e) {
                    console.error(`[Weekly] LINE failed for ${userId}:`, e.message);
                }
            }

            // Send via Web Push
            if (pushSubscription) {
                await sendPushToUser(userId, pushSubscription, {
                    title: `📊 週間レポート: ${recordDays}/7日記録`,
                    body: `平均${avgScore}点 ${comment}`,
                    tag: `weekly-summary-${weekStart}`,
                });
            }

            sent++;
        }

        return NextResponse.json({ success: true, sent });
    } catch (error) {
        console.error('[Weekly Summary] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
