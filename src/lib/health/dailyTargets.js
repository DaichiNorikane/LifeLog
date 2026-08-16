/**
 * 1日の栄養素目標の定義（唯一の真実）
 *
 * 出典は厚生労働省「日本人の食事摂取基準（2020年版）」18〜64歳。
 * ここに1件足すと LINE の栄養サマリーに自動で並ぶ。
 *
 * 【最重要】栄養素によって「良い方向」が逆になる。
 *   atLeast … 多いほど良い（食物繊維・カリウム・鉄・マグネシウム・オメガ3）
 *   atMost  … 少ないほど良い（ナトリウム・糖質）
 * 同じ見た目のバーで両方を表すと 100% が良いのか悪いのか分からなくなるため、
 * 方向を型として持ち、色とバッジで区別する。
 *
 * 値は男女で異なる。gender 未設定の場合は male を既定にする
 * （既定を置かないと目標そのものが出せず、機能が丸ごと死ぬため）。
 */

export const NUTRIENT_TARGETS = [
    {
        key: 'fiber', label: '食物繊維', unit: 'g', direction: 'atLeast',
        male: 21, female: 18, decimals: 0,
        source: '目標量（18〜64歳）',
    },
    {
        key: 'sugar', label: '糖質', unit: 'g', direction: 'atMost',
        derive: 'carbsMinusFiber', decimals: 0,
        source: '炭水化物の目標（総カロリーの50%）から食物繊維を差し引いた値',
    },
    {
        key: 'sodium', label: 'ナトリウム', unit: 'mg', direction: 'atMost',
        male: 2950, female: 2550, decimals: 0,
        source: '食塩相当量 7.5g / 6.5g 未満を換算',
    },
    {
        key: 'potassium', label: 'カリウム', unit: 'mg', direction: 'atLeast',
        male: 3000, female: 2600, decimals: 0,
        source: '目標量（18〜64歳）',
    },
    {
        key: 'iron', label: '鉄', unit: 'mg', direction: 'atLeast',
        male: 7.5, female: 10.5, decimals: 1,
        source: '推奨量（女性は月経ありの値）',
    },
    {
        key: 'magnesium', label: 'マグネシウム', unit: 'mg', direction: 'atLeast',
        male: 370, female: 290, decimals: 0,
        source: '推奨量（30〜64歳）',
    },
    {
        key: 'omega3', label: 'オメガ3', unit: 'mg', direction: 'atLeast',
        male: 1000, female: 1000, decimals: 0,
        // ほかの項目と出典が違う。食事摂取基準の n-3系脂肪酸は ALA を含む目安量だが、
        // ここで扱うのは EPA+DHA なので、一般に用いられる 1g/日 を採用する
        source: 'EPA+DHA 1g/日（食事摂取基準ではなく一般的な推奨）',
    },
];

/** 炭水化物のうちカロリーに占める割合。PFCバランスカードと同じ 50% */
export const CARB_CALORIE_RATIO = 0.5;
const KCAL_PER_CARB_GRAM = 4;

const normalizeGender = (gender) => (gender === 'female' ? 'female' : 'male');

/**
 * その人の当日の目標値を返す。
 *
 * @param {object} profile { gender, targetCalories }
 * @returns {Array<{key, label, unit, direction, value, decimals, source}>}
 */
export const getDailyNutrientTargets = (profile = {}) => {
    const gender = normalizeGender(profile.gender);
    const calories = Number(profile.targetCalories) > 0 ? Number(profile.targetCalories) : 2000;

    const fiberTarget = NUTRIENT_TARGETS.find(t => t.key === 'fiber')?.[gender] ?? 21;

    return NUTRIENT_TARGETS.map((target) => {
        let value;
        if (target.derive === 'carbsMinusFiber') {
            const carbsG = (calories * CARB_CALORIE_RATIO) / KCAL_PER_CARB_GRAM;
            value = Math.max(0, Math.round(carbsG - fiberTarget));
        } else {
            value = target[gender];
        }

        return {
            key: target.key,
            label: target.label,
            unit: target.unit,
            direction: target.direction,
            decimals: target.decimals ?? 0,
            source: target.source,
            value,
        };
    });
};

/**
 * 実測値を目標に照らして判定する。
 *
 * @returns {{percent, status, remaining}|null} 未取得(null)なら null を返す
 *   status: 'ok' | 'short'（不足） | 'over'（超過）
 */
export const evaluateAgainstTarget = (actual, target) => {
    if (actual === null || actual === undefined) return null;
    const value = Number(actual);
    if (!Number.isFinite(value)) return null;
    if (!target || !Number.isFinite(Number(target.value)) || Number(target.value) <= 0) return null;

    const goal = Number(target.value);
    const percent = Math.max(0, (value / goal) * 100);

    if (target.direction === 'atMost') {
        return {
            percent,
            status: value > goal ? 'over' : 'ok',
            // 上限型は「あとどれだけ食べられるか」を返す
            remaining: Math.round((goal - value) * 10) / 10,
        };
    }

    return {
        percent,
        status: value >= goal ? 'ok' : 'short',
        remaining: Math.round((goal - value) * 10) / 10,
    };
};
