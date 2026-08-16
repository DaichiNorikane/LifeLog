import { replyOrPushMessage } from '@/lib/line/client';
import { getJstDateId } from '@/lib/firebase/adminHelpers';
import { buildWeeklyReportText, collectWeeklyStats, getWeekDates, getWeeklyComment } from '@/lib/reports/weeklyReport';

/**
 * 「週間レポート」。
 *
 * 毎週の自動配信（cron/weekly-summary）と同じ集計を、聞かれたその場で返す。
 * リッチメニューの1枠がここに繋がる。
 * 相関分析（今週わかったあなたのこと）は週1回の自動配信だけで更新する。
 */

export const WEEKLY_REPORT_RE = /^(今週|週間|1週間)?の?(週間)?(レポート|まとめ|ふりかえり|振り返り)[？?！!]?$/;

export const isWeeklyReportText = (text) => {
    const trimmed = String(text || '').trim();
    // 「まとめ」「レポート」だけだと日次のサマリーと紛らわしいので、週の言葉を必須にする
    if (!/今週|週間|1週間/.test(trimmed)) return false;
    return WEEKLY_REPORT_RE.test(trimmed);
};

export const handleWeeklyReportEvent = async (event, user) => {
    const weekDates = getWeekDates(getJstDateId());
    const stats = await collectWeeklyStats(user.uid, weekDates);

    if (stats.recordDays === 0) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'この1週間はまだ評価の記録がありません📝\n食事を記録して「総評」と送ると、その日の評価が週間レポートにたまっていきますよ✨',
        });
        return { recordDays: 0 };
    }

    const text = buildWeeklyReportText({
        ...stats,
        comment: getWeeklyComment(stats.recordDays),
    });

    await replyOrPushMessage(event, { type: 'text', text });
    return { recordDays: stats.recordDays, avgScore: stats.avgScore };
};
