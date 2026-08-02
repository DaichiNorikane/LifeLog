// 履歴から登録するカルーセル。
// 同じ料理を繰り返し食べることが多いので、過去の記録をそのまま今日に写せるようにする。

const MAX_BUBBLES = 10;   // LINE のカルーセル上限は12。余裕を持たせる

const roundOrDash = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number)) : '―';
};

const buildBubble = (meal) => ({
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
                    data: `action=log_recent&mid=${meal.id}`,
                    displayText: `${meal.foodName}を記録`,
                },
            },
        ],
    },
});

export const buildRecentMealsFlex = (meals = []) => ({
    type: 'flex',
    altText: '履歴から記録する',
    contents: {
        type: 'carousel',
        contents: meals.slice(0, MAX_BUBBLES).map(buildBubble),
    },
});
