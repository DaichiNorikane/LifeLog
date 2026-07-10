import { getLineChatContextAdmin } from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { buildDailySummaryFlex } from '@/lib/line/flex/dailySummary';
import { resolveUserOrReply } from '@/lib/line/resolveUser';

// 「サマリー」「今日のカロリー」等の短い問い合わせにマッチ（食事記録の発話は誤爆させない）
export const DAILY_SUMMARY_RE = /^(今日|きょう)?の?(カロリー|栄養|サマリー|グラフ|進捗|残りカロリー)(は|って)?(どう|どんな感じ)?[？?！!]?$/;

export const isDailySummaryText = (text) => DAILY_SUMMARY_RE.test(String(text || '').trim());

export const handleDailySummaryEvent = async (event, user = null) => {
    const resolvedUser = user || await resolveUserOrReply(event);
    if (!resolvedUser) return null;

    const context = await getLineChatContextAdmin(resolvedUser.uid, resolvedUser.data || {});
    const meals = context.today?.meals || [];

    if (meals.length === 0) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'まだ今日の記録がありません📝 写真か「◯◯食べた」で記録すると、ここにグラフが出せますよ✨',
        });
        return { mealsCount: 0 };
    }

    await replyOrPushMessage(event, buildDailySummaryFlex({
        dateId: context.today?.dateId,
        totalCalories: context.today?.totalCalories,
        targetCalories: context.user?.targetCalories,
        totalMacros: context.today?.totalMacros || {},
        mealsCount: meals.length,
    }));
    return { mealsCount: meals.length };
};
