import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getLineClient } from '@/lib/line';
import { sendPushToUser, getJSTToday } from '@/lib/pushHelper';
import { getConditionLogsAdmin, saveConditionModelAdmin } from '@/lib/firebase/adminHelpers';
import { analyzeDriverCorrelations, toDisplayableFindings, countAnalyzableDays, MIN_SAMPLE_DAYS } from '@/lib/health/correlation';
import { buildWeeklyReportText, collectWeeklyStats, getWeekDates, getWeeklyComment } from '@/lib/reports/weeklyReport';

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Weekly Summary] Starting...');
        const { todayStr } = getJSTToday();

        // Calculate week range (last 7 days: Mon-Sun)
        const weekDates = getWeekDates(todayStr);

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

            // Collect daily evaluations & weight change for the week
            const stats = await collectWeeklyStats(userId, weekDates);
            const { weekStart, recordDays, avgScore } = stats;

            // Skip if no records this week
            if (recordDays === 0) continue;

            const comment = getWeeklyComment(recordDays);

            // 週1回だけ相関分析を回して個人係数を更新する。
            // Gemini は使わない（純粋な集計なので API コストはゼロ）。
            let insightText = '';
            try {
                const logs = await getConditionLogsAdmin(userId, 60);
                const analyzable = countAnalyzableDays(logs);

                if (analyzable > 0) {
                    const model = analyzeDriverCorrelations(logs);
                    await saveConditionModelAdmin(userId, model);

                    const findings = toDisplayableFindings(model, 2);
                    if (findings.length > 0) {
                        insightText = `\n\n【今週わかったあなたのこと🔍】\n${findings.join('\n')}\n※これは相関の観察です。断定はできませんが、傾向として見てみてくださいね。`;
                    } else {
                        // 「まだ分からない」も正直に伝える（沈黙より信頼される）
                        insightText = `\n\n【体調の分析】\n体感の記録が${analyzable}日分たまりました。あと${Math.max(0, MIN_SAMPLE_DAYS * 2 - analyzable)}日ぶんくらいで、あなただけの傾向が見えてきますよ📊`;
                    }
                }
            } catch (e) {
                console.error(`[Weekly] Condition analysis failed for ${userId}:`, e.message);
            }

            const text = buildWeeklyReportText({ ...stats, comment, insightText });

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
