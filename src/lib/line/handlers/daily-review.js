import { evaluateDailyLog } from '@/app/actions/daily-evaluation';
import { db } from '@/lib/firebase/admin';
import { getLineChatContextAdmin } from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { formatElenaText } from '@/lib/line/textFormat';

/**
 * 「今日の総評」。
 *
 * 夜の自動配信（cron/daily-report）を待たずに、いつでもエレナの日次評価をもらえるようにする。
 * リッチメニューの1枠がここに繋がる。
 * 結果は cron と同じ daily_evaluations/{YYYYMMDD} に保存するので、
 * 週間レポートの記録日数・平均スコアにもそのまま反映される。
 */

// 「総評」「今日の評価」のような短い問い合わせだけにマッチ（食事記録や雑談は誤爆させない）
export const DAILY_REVIEW_RE = /^(今日|きょう)?の?(総評|評価|採点)(して|お願いします?)?[？?！!]?$/;

export const isDailyReviewText = (text) => DAILY_REVIEW_RE.test(String(text || '').trim());

const scoreColor = (score) => {
    if (score >= 8) return '#10B981';
    if (score >= 5) return '#F59E0B';
    return '#EF4444';
};

export const buildDailyReviewFlex = (evaluation, { dateId, totalCalories, targetCalories } = {}) => {
    const score = Number(evaluation.score) || 0;

    return {
        type: 'flex',
        altText: `今日の総評: ${score}点 ${evaluation.title || ''}`.trim(),
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#111827',
                paddingAll: '16px',
                contents: [
                    {
                        type: 'text',
                        text: '今日の総評 by エレナ',
                        color: '#FFFFFF',
                        weight: 'bold',
                        size: 'md',
                    },
                    ...(dateId ? [{
                        type: 'text',
                        text: dateId,
                        color: '#9CA3AF',
                        size: 'xs',
                        margin: 'sm',
                    }] : []),
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        alignItems: 'flex-end',
                        contents: [
                            {
                                type: 'text',
                                text: `${score}`,
                                size: '3xl',
                                weight: 'bold',
                                color: scoreColor(score),
                                flex: 0,
                            },
                            {
                                type: 'text',
                                text: '/ 10点',
                                size: 'sm',
                                color: '#9CA3AF',
                                margin: 'sm',
                                flex: 0,
                            },
                        ],
                    },
                    ...(evaluation.title ? [{
                        type: 'text',
                        text: evaluation.title,
                        weight: 'bold',
                        size: 'lg',
                        wrap: true,
                        color: '#111827',
                    }] : []),
                    ...(Number.isFinite(Number(totalCalories)) && Number.isFinite(Number(targetCalories)) ? [{
                        type: 'text',
                        text: `${Math.round(totalCalories)} / ${Math.round(targetCalories)} kcal`,
                        size: 'sm',
                        color: '#6B7280',
                    }] : []),
                    {
                        type: 'separator',
                    },
                    {
                        type: 'text',
                        text: formatElenaText(evaluation.advice) || 'コメントなし',
                        size: 'sm',
                        wrap: true,
                        color: '#374151',
                    },
                ],
            },
        },
    };
};

export const handleDailyReviewEvent = async (event, user) => {
    const context = await getLineChatContextAdmin(user.uid, user.data || {});
    const meals = context.today?.meals || [];

    if (meals.length === 0) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'まだ今日の記録がありません📝 写真か「◯◯食べた」で記録してくれたら、総評を出しますよ✨',
        });
        return { mealsCount: 0 };
    }

    const evaluation = await evaluateDailyLog({
        date: context.today?.dateId,
        consumedCalories: context.today?.totalCalories || 0,
        targetCalories: context.user?.targetCalories || 2000,
        meals,
        macros: context.today?.totalMacros || {},
        currentWeight: context.user?.currentWeight,
        targetWeight: context.user?.targetWeight,
        targetDate: context.user?.targetDate,
    }, context.stockItems || []);

    if (evaluation?.error || evaluation?.score == null) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめんなさい、いま総評がうまく作れませんでした😢 少し時間を置いてもう一度試してください！',
        });
        return { mealsCount: meals.length, error: evaluation?.error || 'no score' };
    }

    // cron の日次レポートと同じ場所に保存する（週間レポートの集計対象になる）
    try {
        const dateKey = String(context.today?.dateId || '').replace(/-/g, '');
        if (dateKey) {
            await db.collection('users').doc(user.uid)
                .collection('daily_evaluations').doc(dateKey)
                .set({ ...evaluation, createdAt: new Date().toISOString() });
        }
    } catch (e) {
        console.warn('Daily review save failed:', e.message);
    }

    await replyOrPushMessage(event, buildDailyReviewFlex(evaluation, {
        dateId: context.today?.dateId,
        totalCalories: context.today?.totalCalories,
        targetCalories: context.user?.targetCalories,
    }));
    return { mealsCount: meals.length, score: evaluation.score };
};
