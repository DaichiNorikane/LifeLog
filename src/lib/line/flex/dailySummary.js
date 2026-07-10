// 今日のカロリー・栄養サマリーカード（プログレスバー付き）
// PFC目標比率は Web ダッシュボード（page.js の PFC Balance Card）と同じ

const PFC_TARGETS = [
    { label: 'タンパク質 P', key: 'protein', color: '#48BB78', targetRatio: 0.2, kcalPerG: 4 },
    { label: '脂質 F', key: 'fat', color: '#ECC94B', targetRatio: 0.3, kcalPerG: 9 },
    { label: '炭水化物 C', key: 'carbs', color: '#4299E1', targetRatio: 0.5, kcalPerG: 4 },
];

const calorieBarColor = (ratio) => {
    if (ratio <= 0.8) return '#10B981';
    if (ratio <= 1.05) return '#ECC94B';
    return '#EF4444';
};

const clampPercent = (value) => `${Math.max(0, Math.min(100, Math.round(value)))}%`;

const buildProgressBar = (percent, color) => ({
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#EDF2F7',
    cornerRadius: '4px',
    height: '8px',
    margin: 'sm',
    contents: [
        {
            type: 'box',
            layout: 'vertical',
            backgroundColor: color,
            cornerRadius: '4px',
            height: '8px',
            width: clampPercent(percent),
            contents: [{ type: 'filler' }],
        },
    ],
});

const buildBarRow = (label, valueText, percent, color) => ({
    type: 'box',
    layout: 'vertical',
    margin: 'lg',
    contents: [
        {
            type: 'box',
            layout: 'horizontal',
            contents: [
                { type: 'text', text: label, size: 'sm', color: '#6B7280', flex: 5 },
                { type: 'text', text: valueText, size: 'sm', weight: 'bold', color: '#374151', align: 'end', flex: 5 },
            ],
        },
        buildProgressBar(percent, color),
    ],
});

const formatNullable = (value, unit) => {
    if (value === null || value === undefined) return '―';
    const number = Number(value);
    return Number.isFinite(number) ? `${Math.round(number)}${unit}` : '―';
};

const buildNutrientCell = (label, valueText) => ({
    type: 'box',
    layout: 'horizontal',
    flex: 1,
    contents: [
        { type: 'text', text: label, size: 'xs', color: '#6B7280', flex: 5 },
        { type: 'text', text: valueText, size: 'xs', weight: 'bold', color: '#374151', align: 'end', flex: 4 },
    ],
});

export const buildDailySummaryFlex = ({ dateId, totalCalories, targetCalories, totalMacros = {}, mealsCount = 0 }) => {
    const target = Number(targetCalories) || 2000;
    const total = Math.round(Number(totalCalories) || 0);
    const ratio = target > 0 ? total / target : 0;
    const remaining = target - total;
    const remainingText = remaining >= 0
        ? `残り ${remaining}kcal 食べられます🍽️`
        : `${Math.abs(remaining)}kcal オーバーしています⚠️`;

    const pfcRows = PFC_TARGETS.map(macro => {
        const totalG = Math.round(Number(totalMacros[macro.key]) || 0);
        const targetG = Math.round((target * macro.targetRatio) / macro.kcalPerG);
        const percent = targetG > 0 ? (totalG / targetG) * 100 : 0;
        return buildBarRow(macro.label, `${totalG} / ${targetG}g`, percent, macro.color);
    });

    return {
        type: 'flex',
        altText: `今日の栄養サマリー: ${total} / ${target}kcal`,
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#111827',
                paddingAll: '16px',
                contents: [
                    { type: 'text', text: '今日の栄養サマリー📊', color: '#FFFFFF', weight: 'bold', size: 'lg' },
                    { type: 'text', text: `${dateId || ''}・記録${mealsCount}件`, color: '#D1D5DB', size: 'sm', margin: 'sm' },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'text', text: 'カロリー', size: 'sm', color: '#6B7280', flex: 4, gravity: 'bottom' },
                            {
                                type: 'text',
                                text: `${total} / ${target}kcal`,
                                size: 'lg',
                                weight: 'bold',
                                color: '#F97316',
                                align: 'end',
                                flex: 6,
                            },
                        ],
                    },
                    buildProgressBar(ratio * 100, calorieBarColor(ratio)),
                    { type: 'text', text: remainingText, size: 'xs', color: '#6B7280', margin: 'sm' },
                    { type: 'separator', margin: 'lg' },
                    ...pfcRows,
                    { type: 'separator', margin: 'lg' },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        margin: 'lg',
                        spacing: 'lg',
                        contents: [
                            buildNutrientCell('食物繊維', formatNullable(totalMacros.fiber, 'g')),
                            buildNutrientCell('糖質', formatNullable(totalMacros.sugar, 'g')),
                        ],
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        margin: 'md',
                        spacing: 'lg',
                        contents: [
                            buildNutrientCell('ナトリウム', formatNullable(totalMacros.sodium, 'mg')),
                            buildNutrientCell('カリウム', formatNullable(totalMacros.potassium, 'mg')),
                        ],
                    },
                ],
            },
        },
    };
};
