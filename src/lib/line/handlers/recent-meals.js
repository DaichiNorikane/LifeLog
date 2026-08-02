import {
    addMealAdmin, getMealByIdAdmin, getRecentUniqueMealsAdmin,
} from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { buildRecentMealsFlex } from '@/lib/line/flex/recentMeals';
import { MEAL_TYPE_LABELS, getMealTypeForJst } from '@/lib/line/mealUtils';

/**
 * 履歴からの登録。
 *
 * 毎日同じものを食べることが多いので、写真を撮り直したり打ち直したりせず
 * 過去の記録をそのまま今日に写せるようにする。リッチメニューの1枠がここに繋がる。
 */

export const RECENT_MEALS_TEXT_RE = /^(履歴|りれき|いつもの|履歴から|前と同じ)(から)?(記録|登録)?[？?！!]?$/;

export const isRecentMealsText = (text) => RECENT_MEALS_TEXT_RE.test(String(text || '').trim());

export const handleRecentMealsEvent = async (event, user) => {
    const meals = await getRecentUniqueMealsAdmin(user.uid, 10);

    if (meals.length === 0) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'まだ記録がありません📝\n写真を送るか「◯◯食べた」と教えてください。次からはここに並びますよ✨',
        });
        return { count: 0 };
    }

    await replyOrPushMessage(event, buildRecentMealsFlex(meals));
    return { count: meals.length };
};

/**
 * カルーセルの「これを記録」を押したとき。
 * 元の記録から栄養素をコピーし、時刻だけ今にして新しい1件として保存する。
 */
export const handleLogRecentMeal = async (event, user, mealId) => {
    if (!mealId) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'どの記録か分かりませんでした🙏 もう一度「履歴」と送ってください。',
        });
        return { saved: false };
    }

    const source = await getMealByIdAdmin(user.uid, mealId);
    if (!source) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'その記録が見つかりませんでした…消されたのかもしれません🙏',
        });
        return { saved: false };
    }

    const mealType = getMealTypeForJst();
    const meal = {
        foodName: source.foodName,
        calories: source.calories,
        macros: source.macros || {},
        mealType,
        timestamp: new Date().toISOString(),
        image: null,
        // 元の評価は「その日の文脈」での点数なので引き継がない。
        // 今日の食事として改めて評価される
    };

    try {
        meal.id = await addMealAdmin(user.uid, meal);
    } catch (e) {
        console.error('Recent meal save failed:', e);
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめんなさい、保存に失敗しちゃいました😢 少し時間を置いてもう一度試してください！',
        });
        return { saved: false };
    }

    const label = MEAL_TYPE_LABELS[mealType] || '食事';
    const calories = Number.isFinite(Number(source.calories))
        ? `${Math.round(Number(source.calories))}kcal`
        : '';

    await replyOrPushMessage(event, {
        type: 'text',
        text: `${label}に「${source.foodName}」を記録しました✅ ${calories}\n同じものを続けて食べるのは、記録が楽で続きやすいですよ💪`,
    });
    return { saved: true, id: meal.id, mealType };
};
