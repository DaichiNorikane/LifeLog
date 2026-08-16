import { MEAL_TYPE_LABELS } from '@/lib/line/mealUtils';
import { formatElenaText } from '@/lib/line/textFormat';

export const buildMealSavedFlex = (meal, evaluation) => ({
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
            ],
        },
    },
});
