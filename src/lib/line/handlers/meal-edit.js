import { resolveMealEditPlan } from '@/app/actions/meal-edit';
import { getRecentMealsAdmin } from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { buildEditConfirmFlex } from '@/lib/line/flex/editConfirm';
import { createSid, MEAL_TYPE_LABELS } from '@/lib/line/mealUtils';
import { resolveUserOrReply } from '@/lib/line/resolveUser';
import { setLineState } from '@/lib/line/state';

const NOT_FOUND_MESSAGE = '見つからなかったよ😢 もう少し具体的に「今日の朝食」「さっきのカレー」みたいに教えて！';

const jstFormatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

const formatJstDateTime = (timestamp) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '日時不明';
    return jstFormatter.format(date);
};

const formatMealForPlanner = (meal) => ({
    id: meal.id,
    foodName: meal.foodName || '食事',
    mealType: meal.mealType || 'snack',
    calories: Number(meal.calories) || 0,
    jstDateTime: formatJstDateTime(meal.timestamp || meal.createdAt),
});

const targetName = (meal) => {
    const label = MEAL_TYPE_LABELS[meal.mealType] || '食事';
    return `${meal.foodName || '食事'}（${label}/${Number(meal.calories) || 0}kcal）`;
};

export const handleMealEditEvent = async (event, user = null, text = event?.message?.text) => {
    const resolvedUser = user || await resolveUserOrReply(event);
    if (!resolvedUser) return null;

    const recentMeals = await getRecentMealsAdmin(resolvedUser.uid);
    if (recentMeals.length === 0) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'まだ今日の記録がないみたい📝 まずは写真か「◯◯食べた」で記録してね！',
        });
        return null;
    }

    const plannerMeals = recentMeals.map(formatMealForPlanner);
    const plan = await resolveMealEditPlan(text, plannerMeals);
    const mealById = new Map(recentMeals.map(meal => [meal.id, meal]));
    const filteredTargetIds = (plan.targetIds || []).filter(id => mealById.has(id));

    if (plan.operation === 'none' || filteredTargetIds.length === 0) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: plan.notFoundReason || NOT_FOUND_MESSAGE,
        });
        return null;
    }

    if (plan.operation === 'change_type' && !MEAL_TYPE_LABELS[plan.mealType]) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: '変更先の食事タイプが読み取れなかったよ😢 朝食・昼食・夕食・間食のどれかで言ってね！',
        });
        return null;
    }

    const targetNames = filteredTargetIds.map(id => targetName(mealById.get(id)));
    const pendingEdit = {
        operation: plan.operation,
        mealType: plan.operation === 'change_type' ? plan.mealType : null,
        targetIds: filteredTargetIds,
        targetNames,
    };
    const sid = createSid();
    const confirmPlan = {
        ...plan,
        targetIds: filteredTargetIds,
        targetNames,
    };

    await setLineState(resolvedUser.uid, {
        pendingEdit,
        mode: 'awaiting_edit_confirm',
        sid,
    });
    await replyOrPushMessage(event, buildEditConfirmFlex(confirmPlan, sid));
    return { pendingEdit, sid };
};
