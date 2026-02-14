import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getLineClient } from '@/lib/line';
import { evaluateDailyLog } from '@/app/actions';

export async function GET(request) {
    // Vercel Cron security check
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Cron] Starting Daily Report...');

        // 1. Get users with lineUserId
        const usersSnapshot = await db.collection('users')
            .where('lineUserId', '!=', null)
            .get();

        if (usersSnapshot.empty) {
            console.log('[Cron] No users with LINE linked.');
            return NextResponse.json({ message: 'No users linked' });
        }

        const messagingApi = getLineClient();
        const results = [];
        const now = new Date();
        const jstOffset = 9 * 60;
        const jstNow = new Date(now.getTime() + (jstOffset * 60 * 1000));
        const todayStr = jstNow.toISOString().split('T')[0];
        const dateKey = todayStr.replace(/-/g, ''); // yyyyMMdd format for ID often used

        // 2. Iterate users
        for (const doc of usersSnapshot.docs) {
            const userId = doc.id;
            const userData = doc.data();
            const lineUserId = userData.lineUserId;

            // Fetch meals for today (JST)
            const startJST = new Date(`${todayStr}T00:00:00+09:00`);
            const endJST = new Date(`${todayStr}T23:59:59+09:00`);

            const mealsSnapshot = await db.collection('users').doc(userId).collection('meals')
                .where('timestamp', '>=', startJST.toISOString())
                .where('timestamp', '<=', endJST.toISOString())
                .get();

            const meals = mealsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            if (meals.length === 0) {
                console.log(`[Cron] Skipping ${userId} (No meals)`);
                continue;
            }

            // Calculate aggregated data
            const consumedCalories = meals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);

            // Construct data object for evaluateDailyLog
            const evaluationData = {
                date: todayStr,
                consumedCalories,
                targetCalories: userData.targetCalories || 2000,
                meals,
                currentWeight: userData.currentWeight,
                targetWeight: userData.targetWeight,
                targetDate: userData.targetDate,
            };

            // 3. AI Evaluation
            console.log(`[Cron] Evaluating for ${userId}...`);
            const evaluation = await evaluateDailyLog(evaluationData);

            if (evaluation.error) {
                console.error(`[Cron] Evaluation failed for ${userId}:`, evaluation.error);
                continue;
            }

            // 4. Save to Firestore
            await db.collection('users').doc(userId).collection('daily_evaluations').doc(dateKey).set({
                ...evaluation,
                createdAt: new Date().toISOString()
            });

            // 5. Push LINE Message
            const text = `
【${todayStr}の評価レポート by エレナ 🌙】
スコア: ${evaluation.score}点
判定: ${evaluation.title}

${evaluation.reason || evaluation.advice}

(自動配信: 明日も一緒に頑張りましょうね♪)
`.trim();

            await messagingApi.pushMessage({
                to: lineUserId,
                messages: [{ type: 'text', text: text }]
            });

            results.push({ userId, score: evaluation.score });
        }

        return NextResponse.json({ success: true, processed: results.length });
    } catch (error) {
        console.error('[Cron] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
