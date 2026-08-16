// 履歴から登録するカルーセル。
// 同じ料理を繰り返し食べることが多いので、過去の記録をそのまま今日に写せるようにする。

import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from '@/lib/line/mealUtils';

// LINE のカルーセル上限は12。最後の1枚を操作用に使うので、料理は11件まで
export const MAX_MEAL_BUBBLES = 11;

const roundOrDash = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number)) : '―';
};

/** postback のデータ長は300文字まで。キーワードは切り詰めて載せる */
const buildPostbackData = (params) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, String(value).slice(0, 30));
    }
    return search.toString();
};

const buildMealBubble = (meal) => ({
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
                text: meal.foodName,
                weight: 'bold',
                size: 'sm',
                wrap: true,
                maxLines: 2,
                color: '#111827',
            },
            {
                type: 'text',
                text: `${roundOrDash(meal.calories)}kcal`,
                size: 'xs',
                color: '#F97316',
                weight: 'bold',
            },
            {
                type: 'text',
                text: `P${roundOrDash(meal.macros?.protein)} F${roundOrDash(meal.macros?.fat)} C${roundOrDash(meal.macros?.carbs)}`,
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
                    data: buildPostbackData({ action: 'log_recent', mid: meal.id }),
                    displayText: `${meal.foodName}を記録`,
                },
            },
        ],
    },
});

/**
 * 最後に置く操作用のカード。
 * 続きを見る・キーワードで探す・絞り込みを解除する、をここに集める。
 */
const buildActionBubble = ({ hasMore, nextOffset, query, shown, total }) => {
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
                data: buildPostbackData({ action: 'recent_meals', offset: nextOffset, q: query }),
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
            label: 'キーワードで探す',
            data: buildPostbackData({ action: 'recent_search' }),
            displayText: 'キーワードで探す',
        },
    });

    if (query) {
        buttons.push({
            type: 'button',
            style: 'link',
            height: 'sm',
            action: {
                type: 'postback',
                label: 'すべて表示',
                data: buildPostbackData({ action: 'recent_meals' }),
                displayText: 'すべて表示',
            },
        });
    }

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
                    text: query ? `「${query}」` : 'ほかの記録',
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

/**
 * 「これを記録」を押したあとに出す、食事タイプを選ぶカード。
 *
 * 履歴からの登録は「昨日の夜に食べたものを今日の昼に食べる」のように
 * 元の記録とタイプが変わることが多いので、時間帯まかせにせず必ず選んでもらう。
 * ボタンを押した時点でそのタイプで保存する（選択→確定の2段階にはしない）。
 */
export const buildRecentMealTypeFlex = (meal, options = {}) => {
    // レシピからの登録もこのカードを使い回す。押したときの postback だけ差し替える
    const {
        suggestedType,
        logAction = 'log_recent',
        idKey = 'mid',
        cancelAction = 'cancel_recent',
    } = options;

    const typeButton = (mealType) => {
        const suggested = mealType === suggestedType;
        return {
            type: 'button',
            height: 'sm',
            style: suggested ? 'primary' : 'secondary',
            ...(suggested ? { color: '#10B981' } : {}),
            action: {
                type: 'postback',
                label: `${MEAL_TYPE_LABELS[mealType]}で記録`,
                data: buildPostbackData({ action: logAction, [idKey]: meal.id, type: mealType }),
                displayText: `${MEAL_TYPE_LABELS[mealType]}で記録`,
            },
        };
    };

    return {
        type: 'flex',
        altText: `${meal.foodName}をどれで記録しますか？`,
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
                        text: 'どれで記録する？',
                        color: '#FFFFFF',
                        weight: 'bold',
                        size: 'lg',
                    },
                    {
                        type: 'text',
                        text: '押したタイプで、いまの時刻の記録として保存します✨',
                        color: '#D1D5DB',
                        size: 'sm',
                        margin: 'sm',
                        wrap: true,
                    },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    {
                        type: 'text',
                        text: meal.foodName,
                        weight: 'bold',
                        size: 'xl',
                        wrap: true,
                    },
                    {
                        type: 'text',
                        text: `${roundOrDash(meal.calories)}kcal`,
                        weight: 'bold',
                        size: 'lg',
                        color: '#F97316',
                    },
                    {
                        type: 'text',
                        text: `P${roundOrDash(meal.macros?.protein)} F${roundOrDash(meal.macros?.fat)} C${roundOrDash(meal.macros?.carbs)}`,
                        size: 'sm',
                        color: '#9CA3AF',
                    },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        spacing: 'xs',
                        contents: MEAL_TYPE_ORDER.slice(0, 2).map(typeButton),
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        spacing: 'xs',
                        contents: MEAL_TYPE_ORDER.slice(2).map(typeButton),
                    },
                    {
                        type: 'button',
                        style: 'link',
                        height: 'sm',
                        action: {
                            type: 'postback',
                            label: '❌ やめる',
                            data: buildPostbackData({ action: cancelAction }),
                            displayText: 'やめる',
                        },
                    },
                ],
            },
        },
    };
};

export const buildRecentMealsFlex = (meals = [], options = {}) => {
    const { offset = 0, total = meals.length, query = '' } = options;
    const shown = offset + meals.length;
    const hasMore = shown < total;

    return {
        type: 'flex',
        altText: query ? `「${query}」の履歴` : '履歴から記録する',
        contents: {
            type: 'carousel',
            contents: [
                ...meals.slice(0, MAX_MEAL_BUBBLES).map(buildMealBubble),
                buildActionBubble({ hasMore, nextOffset: shown, query, shown, total }),
            ],
        },
    };
};
