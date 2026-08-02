// 今日のカロリー・栄養サマリーカード（プログレスバー付き）
// PFC目標比率は Web ダッシュボード（page.js の PFC Balance Card）と同じ
// 微量栄養素の目標は dailyTargets.js（食事摂取基準ベース・性別で変わる）

import { evaluateAgainstTarget, getDailyNutrientTargets } from '@/lib/health/dailyTargets';

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

const formatAmount = (value, decimals = 0) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '―';
    const rounded = decimals > 0
        ? Math.round(number * 10 ** decimals) / 10 ** decimals
        : Math.round(number);
    return rounded.toLocaleString('ja-JP', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

// 不足は黄・超過は赤・達成は緑。
// 方向（多いほど良い/少ないほど良い）で色の意味が反転しないようにするための対応表
const STATUS_COLOR = { ok: '#10B981', short: '#F59E0B', over: '#EF4444' };

/** 「あと7g」「320mg超過」のような一言。判定できないときは空文字 */
const buildStatusNote = (target, evaluation) => {
    if (!evaluation) return '';
    if (evaluation.status === 'ok') return '';

    const amount = formatAmount(Math.abs(evaluation.remaining), target.decimals);
    if (evaluation.status === 'over') return `+${amount}${target.unit}`;
    return `あと${amount}${target.unit}`;
};

/**
 * 目標つきの栄養素1行。
 * 未取得（null）は今までどおり「―」を出し、バーは出さない。
 * 0 として扱うと「今日は塩分ゼロ」という嘘になる。
 */
const buildNutrientRow = (target, actual) => {
    const evaluation = evaluateAgainstTarget(actual, target);
    const valueText = evaluation
        ? `${formatAmount(actual, target.decimals)} / ${formatAmount(target.value, target.decimals)}${target.unit}`
        : `― / ${formatAmount(target.value, target.decimals)}${target.unit}`;

    const note = buildStatusNote(target, evaluation);
    const labelText = note ? `${target.label}（${note}）` : target.label;

    const contents = [
        {
            type: 'box',
            layout: 'horizontal',
            contents: [
                { type: 'text', text: labelText, size: 'xs', color: '#6B7280', flex: 6 },
                {
                    type: 'text',
                    text: valueText,
                    size: 'xs',
                    weight: 'bold',
                    color: evaluation ? STATUS_COLOR[evaluation.status] : '#9CA3AF',
                    align: 'end',
                    flex: 5,
                },
            ],
        },
    ];

    if (evaluation) {
        contents.push(buildProgressBar(evaluation.percent, STATUS_COLOR[evaluation.status]));
    }

    return { type: 'box', layout: 'vertical', margin: 'md', contents };
};

export const buildDailySummaryFlex = ({
    dateId, totalCalories, targetCalories, totalMacros = {}, mealsCount = 0, profile = {},
}) => {
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

    // 目標値は性別と目標カロリーで変わる（dailyTargets.js が唯一の真実）
    const nutrientTargets = getDailyNutrientTargets({ ...profile, targetCalories: target });
    const nutrientRows = nutrientTargets.map(t => buildNutrientRow(t, totalMacros[t.key]));

    // 不足しているものを名指しで1行にまとめる。バーだけだと何を足せばいいか伝わらない
    const shortfalls = nutrientTargets
        .filter(t => evaluateAgainstTarget(totalMacros[t.key], t)?.status === 'short')
        .map(t => t.label);
    const overs = nutrientTargets
        .filter(t => evaluateAgainstTarget(totalMacros[t.key], t)?.status === 'over')
        .map(t => t.label);

    const notes = [];
    if (shortfalls.length > 0) notes.push(`不足気味: ${shortfalls.join('・')}`);
    if (overs.length > 0) notes.push(`とりすぎ: ${overs.join('・')}`);
    const shortfallNote = notes.join(' ／ ');

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
                    ...nutrientRows,
                    ...(shortfallNote ? [{
                        type: 'text',
                        text: shortfallNote,
                        size: 'xs',
                        color: '#6B7280',
                        margin: 'lg',
                        wrap: true,
                    }] : []),
                ],
            },
        },
    };
};
