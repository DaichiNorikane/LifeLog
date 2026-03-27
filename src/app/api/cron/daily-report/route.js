import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getLineClient } from '@/lib/line';
import { evaluateDailyLog } from '@/app/actions/daily-evaluation';
import webpush from 'web-push';

let vapidConfigured = false;
function ensureVapid() {
    if (vapidConfigured) return true;
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
            'mailto:noreply@lifelog.app',
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
        vapidConfigured = true;
        return true;
    }
    return false;
}

export async function GET(request) {
    // Vercel Cron security check
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Cron] Starting Daily Report...');

        // 1. Get all users (LINE or Web Push)
        const usersSnapshot = await db.collection('users').get();

        if (usersSnapshot.empty) {
            console.log('[Cron] No users found.');
            return NextResponse.json({ message: 'No users' });
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
            const hasPush = !!userData.pushSubscription;

            // Skip users with no notification channel
            if (!lineUserId && !hasPush) continue;

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

            // 5. Send Notifications
            const text = `
【${todayStr}の評価レポート by エレナ 🌙】
スコア: ${evaluation.score}点
判定: ${evaluation.title}

${evaluation.reason || evaluation.advice}

(自動配信: 明日も一緒に頑張りましょうね♪)
`.trim();

            // LINE Push (if linked)
            if (lineUserId) {
                try {
                    await messagingApi.pushMessage({
                        to: lineUserId,
                        messages: [{ type: 'text', text: text }]
                    });
                } catch (lineErr) {
                    console.error(`[Cron] LINE push failed for ${userId}:`, lineErr.message);
                }
            }

            // Web Push (if subscribed)
            const pushSubscription = userData.pushSubscription;
            if (pushSubscription && ensureVapid()) {
                try {
                    const payload = JSON.stringify({
                        title: `エレナの評価: ${evaluation.score}点 ${evaluation.title}`,
                        body: (evaluation.reason || evaluation.advice || '').slice(0, 200),
                        tag: `daily-report-${todayStr}`,
                        url: '/',
                    });
                    await webpush.sendNotification(pushSubscription, payload);
                } catch (pushErr) {
                    console.error(`[Cron] Web Push failed for ${userId}:`, pushErr.message);
                    // Clean up expired subscription
                    if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                        const { FieldValue } = await import('firebase-admin/firestore');
                        await db.collection('users').doc(userId).update({
                            pushSubscription: FieldValue.delete(),
                        }).catch(() => {});
                    }
                }
            }

            results.push({ userId, score: evaluation.score });
        }

        return NextResponse.json({ success: true, processed: results.length });
    } catch (error) {
        console.error('[Cron] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
