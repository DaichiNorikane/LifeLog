import { estimateMealFromText } from '@/app/actions/food-search';
import { replyOrPushMessage } from '@/lib/line/client';
import { buildMealConfirmFlex } from '@/lib/line/flex/mealConfirm';
import { createSid, normalizeMealForLine } from '@/lib/line/mealUtils';
import { setLineState } from '@/lib/line/state';

export const handleMealTextEvent = async (event, user, description) => {
    try {
        const result = await estimateMealFromText(description);
        if (result?.error) throw new Error(result.error);

        const meal = normalizeMealForLine(result);
        const sid = createSid();
        await setLineState(user.uid, { pendingMeal: meal, mode: null, sid });

        await replyOrPushMessage(event, buildMealConfirmFlex(meal, sid));
    } catch (e) {
        console.error("Meal text flow failed:", e);
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめん、栄養計算がうまくできなかった😢 料理名と量をもう少し具体的に送って！',
        });
    }
};

export const handleMealCorrectionEvent = async (event, user, state, correctionText) => {
    if (!state?.pendingMeal) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'そのカードは期限切れみたい💦 もう一度送ってね！',
        });
        return;
    }

    const original = state.pendingMeal;
    const originalDescription = [
        original.foodName,
        original.breakdown?.length ? `内訳: ${original.breakdown.join('、')}` : '',
        original.reasoning ? `前回の推定: ${original.reasoning}` : '',
    ].filter(Boolean).join('\n');

    try {
        const result = await estimateMealFromText(originalDescription, correctionText);
        if (result?.error) throw new Error(result.error);

        const meal = normalizeMealForLine(result, { mealType: original.mealType });
        const sid = createSid();
        await setLineState(user.uid, { pendingMeal: meal, mode: null, sid });

        await replyOrPushMessage(event, buildMealConfirmFlex(meal, sid));
    } catch (e) {
        console.error("Meal correction flow failed:", e);
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめん、修正内容を反映できなかった😢 「ご飯半分」「卵を追加」みたいにもう一度送って！',
        });
    }
};
