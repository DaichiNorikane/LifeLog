import { formatElenaText } from '@/lib/line/textFormat';
import { MEAL_TYPE_LABELS } from '@/lib/line/mealUtils';

// LINE の postback data は300文字まで
const POSTBACK_DATA_MAX = 300;

/**
 * 保存済みの記録を消す postback。カードは後から書き換えられず state の TTL(10分) より長く残るため、
 * 食事IDそのものを data に載せる。IDは `.` 区切り（URLエンコードされず文字数を食わない）。
 * 押すといきなり消さず、既存の「本当に削除しますか？」カードを挟む（action=delete_saved）
 */
export const buildDeleteSavedAction = (mealIds = [], label = '🗑 この記録を削除') => {
    const ids = mealIds.filter(Boolean);
    if (ids.length === 0) return null;
    const data = new URLSearchParams({ action: 'delete_saved', mid: ids.join('.') }).toString();
    if (data.length > POSTBACK_DATA_MAX) return null;
    return { type: 'postback', label, data, displayText: '記録を削除する' };
};

const deleteFooter = (mealIds, label) => {
    const action = buildDeleteSavedAction(mealIds, label);
    if (!action) return {};
    return {
        footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'button', style: 'secondary', height: 'sm', action }],
        },
    };
};

export const buildMealSavedFlex = (meal, evaluation, progress = '') => ({
    type: 'flex',
    altText: `${meal.foodName}を記録しました`,
    contents: {
        type: 'bubble',
        size: 'mega',
        body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
                {
                    type: 'text',
                    text: `${MEAL_TYPE_LABELS[meal.mealType] || '食事'}に記録しました✅`,
                    weight: 'bold',
                    size: 'xl',
                    color: '#111827',
                },
                {
                    type: 'text',
                    text: meal.foodName,
                    weight: 'bold',
                    size: 'lg',
                    wrap: true,
                },
                {
                    type: 'box',
                    layout: 'horizontal',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'text',
                            text: `${meal.calories} kcal`,
                            weight: 'bold',
                            size: 'lg',
                            color: '#F97316',
                            flex: 2,
                        },
                        {
                            type: 'text',
                            text: `Score ${evaluation.score}/10`,
                            weight: 'bold',
                            size: 'md',
                            color: '#2563EB',
                            align: 'end',
                            flex: 2,
                        },
                    ],
                },
                {
                    type: 'separator',
                    margin: 'md',
                },
                {
                    type: 'text',
                    text: formatElenaText(evaluation.reason),
                    wrap: true,
                    size: 'sm',
                    color: '#374151',
                },
                ...(progress ? [{ type: 'text', text: progress, wrap: true, weight: 'bold', size: 'md' }] : []),
            ],
        },
        ...deleteFooter([meal.id]),
    },
});

/** まとめて記録したときの保存完了カード。スコアとコメントは全品の合計に対するもの */
export const buildMealSetSavedFlex = (meals, combined, evaluation, progress = '') => ({
    type: 'flex',
    altText: `${meals.length}品を記録しました`,
    contents: {
        type: 'bubble',
        size: 'mega',
        body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
                {
                    type: 'text',
                    text: `${MEAL_TYPE_LABELS[combined.mealType] || '食事'}に${meals.length}品記録しました✅`,
                    weight: 'bold',
                    size: 'xl',
                    color: '#111827',
                    wrap: true,
                },
                {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'xs',
                    contents: meals.map(meal => ({
                        type: 'box',
                        layout: 'horizontal',
                        spacing: 'sm',
                        contents: [
                            { type: 'text', text: meal.foodName, size: 'sm', wrap: true, flex: 5 },
                            { type: 'text', text: `${meal.calories} kcal`, size: 'sm', color: '#6B7280', align: 'end', flex: 2 },
                        ],
                    })),
                },
                {
                    type: 'box',
                    layout: 'horizontal',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'text',
                            text: `合計 ${combined.calories} kcal`,
                            weight: 'bold',
                            size: 'lg',
                            color: '#F97316',
                            flex: 3,
                        },
                        {
                            type: 'text',
                            text: `Score ${evaluation.score}/10`,
                            weight: 'bold',
                            size: 'md',
                            color: '#2563EB',
                            align: 'end',
                            flex: 2,
                        },
                    ],
                },
                {
                    type: 'separator',
                    margin: 'md',
                },
                {
                    type: 'text',
                    text: formatElenaText(evaluation.reason),
                    wrap: true,
                    size: 'sm',
                    color: '#374151',
                },
                ...(progress ? [{ type: 'text', text: progress, wrap: true, weight: 'bold', size: 'md' }] : []),
            ],
        },
        ...deleteFooter(meals.map(meal => meal.id), `🗑 この${meals.length}品を削除`),
    },
});
