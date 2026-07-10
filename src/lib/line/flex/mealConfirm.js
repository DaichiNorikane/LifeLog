import { MEAL_TYPE_LABELS } from '@/lib/line/mealUtils';

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
const buildTypeButton = (mealType, sid, option) => {
    const selected = mealType === option.type;
    return {
        type: 'button',
        height: 'sm',
        style: selected ? 'primary' : 'secondary',
        ...(selected ? { color: '#10B981' } : {}),
        action: {
            type: 'postback',
            label: option.label,
            data: postbackData('save_meal', sid, { type: option.type }),
        },
    };
};

export const buildMealConfirmFlex = (meal, sid) => ({
    type: 'flex',
    altText: `${meal.foodName}を記録しますか？`,
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
                    },
                },
                {
                    type: 'button',
                    style: 'link',
                    action: {
                        type: 'postback',
                        label: '❌ やめる',
                        data: postbackData('cancel_meal', sid),
                    },
                },
            ],
        },
    },
});
