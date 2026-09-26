import { combineMeals, MEAL_TYPE_LABELS } from '@/lib/line/mealUtils';

const macroText = (meal) => {
    const macros = meal.macros || {};
    return `P ${macros.protein || 0}g / F ${macros.fat || 0}g / C ${macros.carbs || 0}g`;
};

const postbackData = (action, sid, extra = {}) => new URLSearchParams({ action, sid, ...extra }).toString();

const TYPE_BUTTONS = [
    { type: 'breakfast', label: '朝で記録' },
    { type: 'lunch', label: '昼で記録' },
    { type: 'dinner', label: '夕で記録' },
    { type: 'snack', label: '間食で記録' },
];

// タイプボタンはタップした時点でそのタイプとして即保存する
// （LINEは送信済みメッセージを書き換えられないため、選択→確定の2段階にするとカードが増殖する）
// displayText で「昼食で記録」が自分の発言として即座にトークに出る。
// カード自体は書き換えられないので、これがタップへの唯一の即時フィードバックになる
const buildTypeButton = (mealType, sid, option, action = 'save_meal') => {
    const selected = mealType === option.type;
    return {
        type: 'button',
        height: 'sm',
        style: selected ? 'primary' : 'secondary',
        ...(selected ? { color: '#10B981' } : {}),
        action: {
            type: 'postback',
            label: option.label,
            data: postbackData(action, sid, { type: option.type }),
            displayText: `${MEAL_TYPE_LABELS[option.type]}で記録`,
        },
    };
};

export const buildMealConfirmFlex = (meal, sid) => ({
    type: 'flex',
    altText: `${meal.foodName}を記録しますか？`,
    contents: buildMealConfirmBubble(meal, sid),
});

const CIRCLED_NUMBERS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const itemLabel = (index) => CIRCLED_NUMBERS[index] || `${index + 1}.`;

/**
 * 同時に送られた複数の写真をまとめた確認カード。
 * 1品ずつ保存すると「1品目だけ食べた」前提で評価されてしまうため、
 * タイプボタン1回で全品を保存し、合計で評価する（action=save_meals）。
 * 1品だけ違う・直したいときは「1品ずつ確認」で従来の個別カードに分ける。
 */
export const buildMealSetConfirmFlex = (meals, sid) => {
    const total = combineMeals(meals);
    return {
        type: 'flex',
        altText: `${meals.length}品（合計${total.calories}kcal）をまとめて記録しますか？`,
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
                        text: `${meals.length}品まとめて記録しますか？`,
                        color: '#FFFFFF',
                        weight: 'bold',
                        size: 'lg',
                    },
                    {
                        type: 'text',
                        text: '一緒に食べた1回の食事として、合計で評価します✨ 1品だけ違う・直したいときは「1品ずつ確認」からどうぞ！',
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
                spacing: 'md',
                contents: [
                    {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: meals.map((meal, index) => ({
                            type: 'box',
                            layout: 'horizontal',
                            spacing: 'sm',
                            contents: [
                                { type: 'text', text: `${itemLabel(index)} ${meal.foodName}`, size: 'sm', wrap: true, flex: 5 },
                                { type: 'text', text: `${meal.calories} kcal`, size: 'sm', color: '#6B7280', align: 'end', flex: 2 },
                            ],
                        })),
                    },
                    { type: 'separator' },
                    {
                        type: 'box',
                        layout: 'baseline',
                        spacing: 'sm',
                        contents: [
                            { type: 'text', text: '合計', size: 'sm', color: '#6B7280', flex: 0 },
                            { type: 'text', text: `${total.calories} kcal`, weight: 'bold', size: 'xxl', color: '#F97316', flex: 0 },
                        ],
                    },
                    {
                        type: 'text',
                        text: macroText(total),
                        color: '#374151',
                        size: 'sm',
                        wrap: true,
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        spacing: 'sm',
                        contents: [
                            { type: 'text', text: '食事タイプ', color: '#6B7280', size: 'sm', flex: 2 },
                            { type: 'text', text: MEAL_TYPE_LABELS[total.mealType] || '食事', weight: 'bold', size: 'sm', flex: 3 },
                        ],
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
                        contents: TYPE_BUTTONS.slice(0, 2).map(option => buildTypeButton(total.mealType, sid, option, 'save_meals')),
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        spacing: 'xs',
                        contents: TYPE_BUTTONS.slice(2).map(option => buildTypeButton(total.mealType, sid, option, 'save_meals')),
                    },
                    {
                        type: 'button',
                        style: 'secondary',
                        action: {
                            type: 'postback',
                            label: '🍽 1品ずつ確認・修正',
                            data: postbackData('split_meals', sid),
                            displayText: '1品ずつ確認する',
                        },
                    },
                    {
                        type: 'button',
                        style: 'link',
                        action: {
                            type: 'postback',
                            label: '❌ やめる',
                            data: postbackData('cancel_meal', sid),
                            displayText: 'やめる',
                        },
                    },
                ],
            },
        },
    };
};

// カルーセルは12枚まで。それ以上は複数メッセージに分ける（返信は5メッセージまで）
const CAROUSEL_MAX = 12;

/** 「1品ずつ確認」で、まとめカードを従来の個別カードに分けたもの */
export const buildMealConfirmCarousels = (entries) => {
    const messages = [];
    for (let i = 0; i < entries.length; i += CAROUSEL_MAX) {
        const chunk = entries.slice(i, i + CAROUSEL_MAX);
        messages.push({
            type: 'flex',
            altText: `${chunk.map(entry => entry.meal.foodName).join('、')}を記録しますか？`,
            contents: {
                type: 'carousel',
                contents: chunk.map(entry => buildMealConfirmBubble(entry.meal, entry.sid)),
            },
        });
    }
    return messages.slice(0, 5);
};

const buildMealConfirmBubble = (meal, sid) => ({
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
                text: 'この内容で記録しますか？',
                color: '#FFFFFF',
                weight: 'bold',
                size: 'lg',
            },
            {
                type: 'text',
                text: '食事タイプのボタンを押すと、そのタイプで記録します✨ 内容が違っていたら「修正する」からどうぞ！',
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
        spacing: 'md',
        contents: [
            {
                type: 'text',
                text: meal.foodName,
                weight: 'bold',
                size: 'xl',
                wrap: true,
            },
            {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                    { type: 'text', text: `${meal.calories} kcal`, weight: 'bold', size: 'xxl', color: '#F97316', flex: 0 },
                ],
            },
            {
                type: 'text',
                text: macroText(meal),
                color: '#374151',
                size: 'sm',
                wrap: true,
            },
            {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                contents: [
                    {
                        type: 'text',
                        text: '食事タイプ',
                        color: '#6B7280',
                        size: 'sm',
                        flex: 2,
                    },
                    {
                        type: 'text',
                        text: MEAL_TYPE_LABELS[meal.mealType] || '食事',
                        weight: 'bold',
                        size: 'sm',
                        flex: 3,
                    },
                ],
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
                contents: TYPE_BUTTONS.slice(0, 2).map(option => buildTypeButton(meal.mealType, sid, option)),
            },
            {
                type: 'box',
                layout: 'horizontal',
                spacing: 'xs',
                contents: TYPE_BUTTONS.slice(2).map(option => buildTypeButton(meal.mealType, sid, option)),
            },
            {
                type: 'button',
                style: 'secondary',
                action: {
                    type: 'postback',
                    label: '✏️ 修正する',
                    data: postbackData('edit_meal', sid),
                    displayText: '修正する',
                },
            },
            {
                type: 'button',
                style: 'link',
                action: {
                    type: 'postback',
                    label: '❌ やめる',
                    data: postbackData('cancel_meal', sid),
                    displayText: 'やめる',
                },
            },
        ],
    },
});
