// 履歴から登録するカルーセル。
// 同じ料理を繰り返し食べることが多いので、過去の記録をそのまま今日に写せるようにする。

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
