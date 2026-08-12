import {
    addMealAdmin, getMealByIdAdmin, getRecentUniqueMealsAdmin,
} from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { MAX_MEAL_BUBBLES, buildRecentMealTypeFlex, buildRecentMealsFlex } from '@/lib/line/flex/recentMeals';
import { MEAL_TYPE_LABELS, getMealTypeForJst, isMealType } from '@/lib/line/mealUtils';
import { clearLineState, setLineState } from '@/lib/line/state';

/**
 * 履歴からの登録。
 *
 * 毎日同じものを食べることが多いので、写真を撮り直したり打ち直したりせず
 * 過去の記録をそのまま今日に写せるようにする。リッチメニューの1枠がここに繋がる。
 */

export const RECENT_MEALS_TEXT_RE = /^(履歴|りれき|いつもの|履歴から|前と同じ)(から)?(記録|登録)?[？?！!]?$/;

// 「履歴 唐揚げ」のように、そのままキーワードを続けて絞り込める
export const RECENT_MEALS_SEARCH_RE = /^(?:履歴|りれき)(?:から)?(?:検索)?[\s　]+(.+)$/;

export const isRecentMealsText = (text) => RECENT_MEALS_TEXT_RE.test(String(text || '').trim());

/** 「履歴 唐揚げ」ならキーワードを、ただの「履歴」なら空文字を返す。該当しなければ null */
export const parseRecentMealsQuery = (text) => {
    const trimmed = String(text || '').trim();
    if (RECENT_MEALS_TEXT_RE.test(trimmed)) return '';

    const match = RECENT_MEALS_SEARCH_RE.exec(trimmed);
    if (!match) return null;

    const query = match[1].trim();
    return query || '';
};

export const handleRecentMealsEvent = async (event, user, options = {}) => {
    const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, Number(options.offset)) : 0;
    const query = String(options.query || '').trim();

    const { meals, total } = await getRecentUniqueMealsAdmin(user.uid, {
        limit: MAX_MEAL_BUBBLES,
        offset,
        query,
    });

    if (meals.length === 0) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: query
                ? `「${query}」に合う記録が見つかりませんでした🔍\n別の言葉で試すか、「履歴」で全部を見てみてください。`
                : 'まだ記録がありません📝\n写真を送るか「◯◯食べた」と教えてください。次からはここに並びますよ✨',
        });
        return { count: 0, total, query };
    }

    await replyOrPushMessage(event, buildRecentMealsFlex(meals, { offset, total, query }));
    return { count: meals.length, total, query, offset };
};

/** 「キーワードで探す」を押したとき。次に送られてくる言葉を検索語として扱う */
export const handleRecentSearchPrompt = async (event, user) => {
    await setLineState(user.uid, {
        sid: `recent-search-${Date.now()}`,
        mode: 'awaiting_recent_search',
    });

    await replyOrPushMessage(event, {
        type: 'text',
        text: '探したい料理の名前を送ってください🔍\n例:「唐揚げ」「サラダ」\n\n「履歴 唐揚げ」のようにまとめて送ってもOKです！',
    });
    return { prompted: true };
};

/** 検索待ちの状態で言葉が届いたとき */
export const handleRecentSearchInput = async (event, user, state, text) => {
    await clearLineState(user.uid, state.sid);
    return handleRecentMealsEvent(event, user, { query: text });
};

/**
 * カルーセルの「これを記録」を押したとき。
 *
 * タイプ未指定なら、まず朝食/昼食/夕食/間食を選ぶカードを返す。
 * 履歴からの登録は元の記録とタイプが変わることが多く（夜に食べたものを翌日の昼に食べる等）、
 * 時間帯からの推測だけで保存すると、あとで直す手間のほうが大きくなるため。
 * タイプが指定されたら、元の記録から栄養素をコピーし、時刻だけ今にして新しい1件として保存する。
 */
export const handleLogRecentMeal = async (event, user, mealId, requestedType) => {
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

    if (!isMealType(requestedType)) {
        await replyOrPushMessage(event, buildRecentMealTypeFlex(
            { ...source, id: mealId },
            { suggestedType: getMealTypeForJst() },
        ));
        return { saved: false, askedType: true };
    }

    const mealType = requestedType;
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
