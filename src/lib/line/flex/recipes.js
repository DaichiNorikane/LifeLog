// 「レシピから記録」のカルーセル。
// Webで登録したレシピをLINEからそのまま今日の記録にできるようにする。
// カテゴリはWebと同じ定義（recipeCategories.js）を使う。

import { getRecipeCategoryIcon, getRecipeCategoryLabel } from '@/lib/recipeCategories';

// LINE のカルーセル上限は12。最後の1枚を操作用に使うので、レシピは11件まで
export const MAX_RECIPE_BUBBLES = 11;

const roundOrDash = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number)) : '―';
};

const buildPostbackData = (params) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, String(value).slice(0, 30));
    }
    return search.toString();
};

const buildRecipeBubble = (recipe) => ({
    type: 'bubble',
    size: 'micro',
    body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '14px',
        contents: [
            {
                type: 'text',
                text: `${getRecipeCategoryIcon(recipe.category)} ${getRecipeCategoryLabel(recipe.category)}`,
                size: 'xxs',
                color: '#6B7280',
            },
            {
                type: 'text',
                text: recipe.foodName,
                weight: 'bold',
                size: 'sm',
                wrap: true,
                maxLines: 2,
                color: '#111827',
            },
            {
                type: 'text',
                text: `${roundOrDash(recipe.calories)}kcal / 人前`,
                size: 'xs',
                color: '#F97316',
                weight: 'bold',
            },
            {
                type: 'text',
                text: `P${roundOrDash(recipe.macros?.protein)} F${roundOrDash(recipe.macros?.fat)} C${roundOrDash(recipe.macros?.carbs)}`,
                size: 'xxs',
                color: '#9CA3AF',
            },
        ],
    },
    footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        contents: [
            {
                type: 'button',
                style: 'primary',
                height: 'sm',
                color: '#10B981',
                action: {
                    type: 'postback',
                    label: 'これを記録',
                    data: buildPostbackData({ action: 'log_recipe', rid: recipe.id }),
                    displayText: `${recipe.foodName}を記録`,
                },
            },
        ],
    },
});

/** 末尾の操作カード。続きを見る・カテゴリで絞る・絞り込み解除をここに集める */
const buildActionBubble = ({ hasMore, nextOffset, category, shown, total }) => {
    const buttons = [];

    if (hasMore) {
        buttons.push({
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#3B82F6',
            action: {
                type: 'postback',
                label: 'もっと見る',
                data: buildPostbackData({ action: 'recipes', offset: nextOffset, cat: category }),
                displayText: 'もっと見る',
            },
        });
    }

    buttons.push({
        type: 'button',
        style: 'secondary',
        height: 'sm',
        action: {
            type: 'postback',
            label: 'カテゴリで絞る',
            data: buildPostbackData({ action: 'recipe_cats' }),
            displayText: 'カテゴリで絞る',
        },
    });

    if (category) {
        buttons.push({
            type: 'button',
            style: 'link',
            height: 'sm',
            action: {
                type: 'postback',
                label: 'すべて表示',
                data: buildPostbackData({ action: 'recipes' }),
                displayText: 'すべて表示',
            },
        });
    }

    const title = category
        ? `${getRecipeCategoryIcon(category === 'none' ? null : category)} ${getRecipeCategoryLabel(category === 'none' ? null : category)}`
        : 'ほかのレシピ';

    return {
        type: 'bubble',
        size: 'micro',
        body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: '14px',
            contents: [
                {
                    type: 'text',
                    text: title,
                    weight: 'bold',
                    size: 'sm',
                    wrap: true,
                    maxLines: 2,
                    color: '#111827',
                },
                {
                    type: 'text',
                    text: `${shown} / ${total}件`,
                    size: 'xs',
                    color: '#9CA3AF',
                },
            ],
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            paddingAll: '10px',
            contents: buttons,
        },
    };
};

export const buildRecipesFlex = (recipes = [], options = {}) => {
    const { offset = 0, total = recipes.length, category = '' } = options;
    const shown = offset + recipes.length;
    const hasMore = shown < total;

    return {
        type: 'flex',
        altText: category ? 'カテゴリのレシピから記録する' : 'レシピから記録する',
        contents: {
            type: 'carousel',
            contents: [
                ...recipes.slice(0, MAX_RECIPE_BUBBLES).map(buildRecipeBubble),
                buildActionBubble({ hasMore, nextOffset: shown, category, shown, total }),
            ],
        },
    };
};

/**
 * カテゴリ選択カード。レシピがあるカテゴリだけボタンにする。
 * groups は recipeCategories.groupRecipesByCategory の結果。
 */
export const buildRecipeCategoriesFlex = (groups = [], total = 0) => ({
    type: 'flex',
    altText: 'レシピのカテゴリを選ぶ',
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
                    text: 'どのカテゴリを見ますか？',
                    color: '#FFFFFF',
                    weight: 'bold',
                    size: 'lg',
                },
                {
                    type: 'text',
                    text: `保存済みレシピ ${total}件`,
                    color: '#D1D5DB',
                    size: 'sm',
                    margin: 'sm',
                },
            ],
        },
        body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
                ...groups.map(group => ({
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    action: {
                        type: 'postback',
                        label: `${group.icon} ${group.label} (${group.recipes.length})`,
                        // 未分類（id=null）は cat=none で表す
                        data: buildPostbackData({ action: 'recipes', cat: group.id === null ? 'none' : group.id }),
                        displayText: `${group.label}のレシピ`,
                    },
                })),
                {
                    type: 'button',
                    style: 'link',
                    height: 'sm',
                    action: {
                        type: 'postback',
                        label: 'すべて表示',
                        data: buildPostbackData({ action: 'recipes' }),
                        displayText: 'すべて表示',
                    },
                },
            ],
        },
    },
});
