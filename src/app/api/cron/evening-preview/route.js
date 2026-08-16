import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getLineClient } from '@/lib/line';
import { getJSTToday, sendPushWithLimit, getTodayMeals, getOrRunEvaluation } from '@/lib/pushHelper';
import { evaluateCondition } from '@/lib/health/conditionEngine';
import { buildEveningSleepNote } from '@/lib/health/conditionMessages';

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Evening Preview] Starting...');
        const { todayStr } = getJSTToday();

        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) return NextResponse.json({ message: 'No users' });

        const messagingApi = getLineClient();

        let sent = 0;

        for (const doc of usersSnapshot.docs) {
            const userId = doc.id;
            const userData = doc.data();
            const subscription = userData.pushSubscription;
            const lineUserId = userData.lineUserId;
            if (!subscription && !lineUserId) continue;

            const meals = await getTodayMeals(userId, todayStr);

            // Skip if no meals recorded today (no context to give advice)
            if (meals.length === 0) continue;

            const target = userData.targetCalories || 2000;
            const consumed = meals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);
            const remaining = target - consumed;

            // Run AI evaluation for personalized evening advice
            const evaluation = await getOrRunEvaluation(userId, todayStr, meals, userData);
            const score = evaluation?.score;
            const evalAdvice = evaluation?.advice || evaluation?.reason || '';

            let title, body;

            if (remaining > target * 0.4) {
                title = score ? `今日ここまで${score}点🍽️` : 'エレナの夕食アドバイス🍽️';
                if (evalAdvice) {
                    body = `${consumed}kcal消費、あと${remaining}kcal余裕あり！${evalAdvice.slice(0, 80)}`;
                } else {
                    body = `今日はまだ${consumed}kcal。あと${remaining}kcalも余裕がありますよ！好きなものを食べていいと思います😋`;
                }
            } else if (remaining > 200) {
                title = score ? `現在${score}点、夕食が勝負🤔` : '夕食どうしますか？🤔';
                if (evalAdvice) {
                    body = `残り${remaining}kcal。${evalAdvice.slice(0, 100)}`;
                } else {
                    body = `残り${remaining}kcalです。バランス良く、タンパク質多めの夕食がおすすめですよ💪`;
                }
            } else if (remaining > 0) {
                title = score ? `${score}点、ラストスパート⚠️` : 'ちょっと注意⚠️';
                if (evalAdvice) {
                    body = `残り${remaining}kcal！${evalAdvice.slice(0, 100)}`;
                } else {
                    body = `残り${remaining}kcalしかありませんよ！サラダ+チキンなど、軽めでいきましょう🥗`;
                }
            } else {
                const over = Math.abs(remaining);
                title = score ? `${score}点、リカバリーしましょう📊` : 'エレナからお知らせ📊';
                if (evalAdvice) {
                    body = `${over}kcalオーバー。${evalAdvice.slice(0, 100)}`;
                } else {
                    body = `${over}kcalオーバー気味ですが、軽い夕食にすればリカバリーできますよ！諦めないでくださいね💪`;
                }
            }

            // 今夜の睡眠予測を添える。行動を変えられる最後のタイミングなので効果が大きい。
            // スコアは決定論エンジンが出すので Gemini の追加呼び出しは発生しない。
            const condition = evaluateCondition({
                dateKey: todayStr,
                meals,
                profile: {
                    bedtime: userData.bedtime,
                    targetCalories: target,
                    currentWeight: userData.currentWeight,
                },
                now: new Date(),
            });
            const sleepNote = buildEveningSleepNote(condition);
            if (sleepNote) {
                body = `${body}\n${sleepNote}`;
            }

            // 今夜の眠りは行動を変えられる最後のタイミングなので LINE にも届ける
            if (lineUserId) {
                try {
                    await messagingApi.pushMessage({
                        to: lineUserId,
                        messages: [{ type: 'text', text: `【エレナより 🌙】\n${title}\n\n${body}` }],
                    });
                } catch (e) {
                    console.error(`[Evening Preview] LINE failed for ${userId}:`, e.message);
                }
            }

            let success = false;
            if (subscription) {
                success = await sendPushWithLimit(userId, subscription, todayStr, 'evening-preview', {
                    title,
                    body,
                    tag: `evening-preview-${todayStr}`,
                });
            }
            if (success || lineUserId) sent++;
        }

        return NextResponse.json({ success: true, sent });
    } catch (error) {
        console.error('[Evening Preview] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
