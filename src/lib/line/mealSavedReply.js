import { formatElenaText } from '@/lib/line/textFormat';
import { evaluateSingleMeal } from '@/app/actions/daily-evaluation';
import { getLineChatContextAdmin, saveLineChatExchangeAdmin } from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { buildMealSavedFlex } from '@/lib/line/flex/mealSaved';
import { MEAL_TYPE_LABELS } from '@/lib/line/mealUtils';

/** 保存済みの記録を含む当日の集計を取得し、評価とカロリーだけの進捗を返す。 */
export const replyWithSavedMeal = async (event, user, meal, { flex = false } = {}) => {
    const label = MEAL_TYPE_LABELS[meal.mealType] || '食事';
    let progress = '現在の合計カロリーを取得できませんでした';
    let evaluation;
    try {
        const context = await getLineChatContextAdmin(user.uid, user.data || {});
        const total = context.today?.totalCalories;
        const target = context.user?.targetCalories;
        if (total != null && Number.isFinite(Number(total)) && Number(target) > 0) {
            progress = `現在${Math.round(Number(total))}kcal / ${Math.round(Number(target))}kcal`;
        }
        evaluation = await evaluateSingleMeal(meal, context.today?.meals || [], {
            messageHistory: context.messageHistory || [],
        });
    } catch (e) {
        console.warn('Saved meal feedback failed:', e.message);
    }
    const evaluated = !evaluation?.error && evaluation?.score != null && evaluation?.reason;
    const feedback = evaluated ? evaluation.reason : '食事の評価は今取得できませんでした。記録は保存されています👌';
    const text = `${label}に「${meal.foodName}」を記録しました✅\n${feedback}\n\n${progress}`;
    await replyOrPushMessage(event, flex && evaluated
        ? buildMealSavedFlex(meal, evaluation, progress)
        : { type: 'text', text: formatElenaText(text) });
    try {
        await saveLineChatExchangeAdmin(user.uid,
            `（食事を記録: ${meal.foodName} ${meal.calories}kcal / ${label}）`,
            `${feedback}\n\n${progress}`);
    } catch (e) {
        console.warn('Meal exchange history save failed:', e.message);
    }
};
