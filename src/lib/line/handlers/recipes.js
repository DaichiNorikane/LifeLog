import {
    addMealAdmin, getRecipeByIdAdmin, getRecipesAdmin,
} from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { buildRecentMealTypeFlex } from '@/lib/line/flex/recentMeals';
import { MAX_RECIPE_BUBBLES, buildRecipeCategoriesFlex, buildRecipesFlex } from '@/lib/line/flex/recipes';
import { MEAL_TYPE_LABELS, getMealTypeForJst, isMealType } from '@/lib/line/mealUtils';
import { groupRecipesByCategory, normalizeRecipeCategory } from '@/lib/recipeCategories';

/**
 * レシピからの登録。
 *
 * Webで作ったレシピ（自炊の定番）をLINEからそのまま今日の記録にできるようにする。
 * リッチメニューの「レシピ登録」がここに繋がる。
 * カテゴリはWebと共通（recipeCategories.js）で、カルーセルの操作カードから絞り込める。
 */

export const RECIPES_TEXT_RE = /^(レシピ|れしぴ)(から)?(記録|登録)?[？?！!]?$/;

export const isRecipesText = (text) => RECIPES_TEXT_RE.test(String(text || '').trim());

/** cat パラメータをメモリ上のフィルタに変換する。'none' は未分類（category=null）の意味 */
const filterByCategory = (recipes, cat) => {
    if (!cat) return recipes;
    if (cat === 'none') return recipes.filter(r => !normalizeRecipeCategory(r.category));
    return recipes.filter(r => normalizeRecipeCategory(r.category) === cat);
};

export const handleRecipesEvent = async (event, user, options = {}) => {
    const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, Number(options.offset)) : 0;
    const category = String(options.category || '').trim();

    const all = await getRecipesAdmin(user.uid);

    if (all.length === 0) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'まだレシピがありません📖\nWebアプリの「記録する → レシピ」から定番メニューを登録すると、ここから1タップで記録できるようになりますよ✨',
        });
        return { count: 0, total: 0 };
    }

    const filtered = filterByCategory(all, category);
    if (filtered.length === 0) {
        // カテゴリ絞り込みで0件。カテゴリ選択に戻す
        await replyOrPushMessage(event, buildRecipeCategoriesFlex(groupRecipesByCategory(all), all.length));
        return { count: 0, total: all.length, category };
    }

    const page = filtered.slice(offset, offset + MAX_RECIPE_BUBBLES);
    await replyOrPushMessage(event, buildRecipesFlex(page, {
        offset,
        total: filtered.length,
        category,
    }));
    return { count: page.length, total: filtered.length, category, offset };
};

/** 「カテゴリで絞る」を押したとき。レシピがあるカテゴリだけ並べる */
export const handleRecipeCategoriesEvent = async (event, user) => {
    const all = await getRecipesAdmin(user.uid);

    if (all.length === 0) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'まだレシピがありません📖 Webアプリの「レシピ」タブから登録してくださいね！',
        });
        return { total: 0 };
    }

    await replyOrPushMessage(event, buildRecipeCategoriesFlex(groupRecipesByCategory(all), all.length));
    return { total: all.length };
};

/**
 * カルーセルの「これを記録」を押したとき。
 * 履歴からの登録と同じく、タイプ未指定ならまず朝食/昼食/夕食/間食を選んでもらう
 * （レシピの登録時刻と食べる時刻はズレることが多いため、時間帯まかせにしない）。
 */
export const handleLogRecipe = async (event, user, recipeId, requestedType) => {
    if (!recipeId) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'どのレシピか分かりませんでした🙏 もう一度「レシピ」と送ってください。',
        });
        return { saved: false };
    }

    const recipe = await getRecipeByIdAdmin(user.uid, recipeId);
    if (!recipe) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'そのレシピが見つかりませんでした…消されたのかもしれません🙏',
        });
        return { saved: false };
    }

    if (!isMealType(requestedType)) {
        await replyOrPushMessage(event, buildRecentMealTypeFlex(
            { ...recipe, id: recipeId },
            {
                suggestedType: getMealTypeForJst(),
                logAction: 'log_recipe',
                idKey: 'rid',
                cancelAction: 'cancel_recipe',
            },
        ));
        return { saved: false, askedType: true };
    }

    const mealType = requestedType;
    const meal = {
        foodName: recipe.foodName,
        calories: recipe.calories,
        macros: recipe.macros || {},
        mealType,
        timestamp: new Date().toISOString(),
        image: null,
        reasoning: 'レシピから記録',
    };

    try {
        meal.id = await addMealAdmin(user.uid, meal);
    } catch (e) {
        console.error('Recipe meal save failed:', e);
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめんなさい、保存に失敗しちゃいました😢 少し時間を置いてもう一度試してください！',
        });
        return { saved: false };
    }

    const label = MEAL_TYPE_LABELS[mealType] || '食事';
    const calories = Number.isFinite(Number(recipe.calories))
        ? `${Math.round(Number(recipe.calories))}kcal`
        : '';

    await replyOrPushMessage(event, {
        type: 'text',
        text: `${label}に「${recipe.foodName}」を記録しました✅ ${calories}\n自炊の記録、いいですね！レシピからならワンタップで続けられますよ💪`,
    });
    return { saved: true, id: meal.id, mealType };
};
