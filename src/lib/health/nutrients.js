/**
 * 拡張栄養素の定義（唯一の真実）
 *
 * ここに1件追加すると、以下すべてに自動反映される:
 *   - Gemini のレスポンススキーマ (src/app/actions/gemini-client.js)
 *   - 各 actions のプロンプト指示文
 *   - ダッシュボードの日次集計 (src/app/page.js)
 *   - Firestore 保存時の null 正規化
 *
 * 【重要】値は必ず `number | null`。
 *   null = AI が推定できなかった / 0 = 実際にゼロ。この2つは絶対に混同しない。
 *
 * scope:
 *   'daily' … 1日合計でのみ意味を持つ。AI推定の絶対値は甘いので帯域判定にしか使わない
 *   'meal'  … 食事単位＋摂取時刻で意味を持つ。コンディション判定に直接使う
 *
 * aggregate:
 *   'sum' … 1日の合計値が指標になる
 *   'avg' … 1日の平均値が指標になる（超加工度など、合計に意味がないもの）
 */
export const EXTENDED_NUTRIENTS = [
    // --- 既存（ダイエット関連） ---
    {
        key: 'fiber', label: '食物繊維', unit: 'g', scope: 'daily', aggregate: 'sum',
        hint: '食物繊維 (g)',
    },
    {
        key: 'sugar', label: '糖質', unit: 'g', scope: 'daily', aggregate: 'sum',
        hint: '糖質 (g)（炭水化物から食物繊維を除いた値）',
    },
    {
        key: 'sodium', label: 'ナトリウム', unit: 'mg', scope: 'daily', aggregate: 'sum',
        hint: 'ナトリウム (mg)（食塩相当量(g) × 393 に相当）',
    },
    {
        key: 'potassium', label: 'カリウム', unit: 'mg', scope: 'daily', aggregate: 'sum',
        hint: 'カリウム (mg)',
    },

    // --- Tier 1（コンディション関連） ---
    {
        key: 'caffeine', label: 'カフェイン', unit: 'mg', scope: 'meal', aggregate: 'sum',
        hint: 'カフェイン (mg)。コーヒー1杯≒90mg、緑茶1杯≒30mg、エナジードリンク1本≒140mg。含まないことが明らかなら 0',
    },
    {
        key: 'alcohol', label: 'アルコール', unit: 'g', scope: 'meal', aggregate: 'sum',
        hint: '純アルコール量 (g)。ビール500ml≒20g、日本酒1合≒22g、ハイボール1杯≒14g。含まないことが明らかなら 0',
    },
    {
        key: 'omega3', label: 'オメガ3', unit: 'mg', scope: 'daily', aggregate: 'sum',
        hint: 'EPA + DHA の合計 (mg)。青魚・くるみ・亜麻仁油など',
    },
    {
        key: 'tryptophan', label: 'トリプトファン', unit: 'mg', scope: 'daily', aggregate: 'sum',
        hint: 'トリプトファン (mg)。乳製品・大豆製品・肉・魚など',
    },
    {
        key: 'magnesium', label: 'マグネシウム', unit: 'mg', scope: 'daily', aggregate: 'sum',
        hint: 'マグネシウム (mg)。ナッツ・海藻・全粒穀物など',
    },
    {
        key: 'iron', label: '鉄', unit: 'mg', scope: 'daily', aggregate: 'sum',
        hint: '鉄 (mg)',
    },
    {
        key: 'vitaminD', label: 'ビタミンD', unit: 'µg', scope: 'daily', aggregate: 'sum',
        hint: 'ビタミンD (µg)。魚・きのこ類など',
    },
    {
        key: 'saturatedFat', label: '飽和脂肪酸', unit: 'g', scope: 'daily', aggregate: 'sum',
        hint: '脂質のうち飽和脂肪酸 (g)',
    },
    {
        key: 'glycemicLoad', label: '血糖負荷', unit: '', scope: 'meal', aggregate: 'sum',
        hint: 'この食事全体の推定グリセミックロード(GL)。目安: 10以下=低, 11-19=中, 20以上=高',
    },
    {
        key: 'ultraProcessed', label: '超加工度', unit: '', scope: 'meal', aggregate: 'avg',
        hint: '超加工度を 0〜3 の整数で。0=素材そのもの/手作り, 1=軽い加工, 2=加工食品, 3=超加工食品（菓子パン・カップ麺・スナック・清涼飲料）',
    },
];

export const EXTENDED_NUTRIENT_KEYS = EXTENDED_NUTRIENTS.map(n => n.key);

export const BASE_MACRO_KEYS = ['protein', 'fat', 'carbs'];

/** 食事単位＋時刻で判定に使う栄養素（コンディションエンジンが1食ごとに参照する） */
export const MEAL_SCOPED_NUTRIENT_KEYS = EXTENDED_NUTRIENTS
    .filter(n => n.scope === 'meal')
    .map(n => n.key);

export const getNutrientDef = (key) => EXTENDED_NUTRIENTS.find(n => n.key === key) || null;

/**
 * Gemini プロンプトに差し込む拡張栄養素の指示文。
 * 各 actions で同じ文言を重複定義しないための共通化。
 */
export const EXTENDED_NUTRIENTS_INSTRUCTION = `
【拡張栄養素（macros 内に含める）】
可能な限り正確な値を推定してください。
**信頼できる根拠がない場合は 0 ではなく null を設定してください。** 0 と null の混同は厳禁です
（null = 推定できなかった、0 = 実際に含まれていない）。
${EXTENDED_NUTRIENTS.map(n => `- ${n.key}: ${n.hint}`).join('\n')}
`.trim();

/** undefined / '' / NaN を null に寄せる（0 は 0 のまま残す） */
export const toNullableNumber = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

/**
 * macros を保存・集計前の正規化された形にする。
 * - 基本マクロ (protein/fat/carbs) は数値（不正値は 0）
 * - 拡張栄養素は number | null（キーが無ければ null を明示的に埋める）
 */
export const normalizeMacros = (macros = {}) => {
    const source = macros || {};
    const result = {};

    for (const key of BASE_MACRO_KEYS) {
        const num = toNullableNumber(source[key]);
        result[key] = num === null ? 0 : num;
    }
    for (const key of EXTENDED_NUTRIENT_KEYS) {
        result[key] = toNullableNumber(source[key]);
    }
    return result;
};

/** 日次集計の初期値。拡張栄養素は合計値と「何件から合算したか」をセットで持つ */
export const createMacroTotals = () => {
    const totals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    for (const key of EXTENDED_NUTRIENT_KEYS) {
        totals[key] = 0;
        totals[`${key}Recorded`] = 0;
    }
    return totals;
};

/**
 * 1食分を集計に足し込む（イミュータブル）。
 * 拡張栄養素は null をスキップし、合算に使った件数だけ Recorded を増やす。
 */
export const accumulateMacroTotals = (totals, meal) => {
    const next = { ...totals };
    const calories = toNullableNumber(meal?.calories);
    next.calories += calories === null ? 0 : calories;

    const macros = meal?.macros || {};
    for (const key of BASE_MACRO_KEYS) {
        const num = toNullableNumber(macros[key]);
        next[key] += num === null ? 0 : num;
    }
    for (const key of EXTENDED_NUTRIENT_KEYS) {
        const num = toNullableNumber(macros[key]);
        if (num === null) continue;
        next[key] += num;
        next[`${key}Recorded`] += 1;
    }
    return next;
};

/** 食事の配列から日次合計を作る */
export const sumMacroTotals = (meals = []) =>
    meals.reduce((acc, meal) => accumulateMacroTotals(acc, meal), createMacroTotals());

/** その栄養素が1件でも記録されているか（記録ゼロなら UI は「―」を出す） */
export const hasNutrientData = (totals, key) => (totals?.[`${key}Recorded`] || 0) > 0;

/** 平均集計型の栄養素（超加工度など）の平均値。記録が無ければ null */
export const getNutrientAverage = (totals, key) => {
    const count = totals?.[`${key}Recorded`] || 0;
    if (count === 0) return null;
    return totals[key] / count;
};

/**
 * カロリーもマクロもほぼゼロの記録か（水・お茶・ブラックコーヒーなど）。
 *
 * こうした記録は1日のカロリー/PFC評価を数値的に動かさないため、
 * エレナの採点（Gemini呼び出し）をスキップしてよい。
 * カフェインなどのコンディション判定は決定論エンジンが担うので精度は落ちない。
 */
export const TRIVIAL_MEAL_LIMITS = { calories: 50, macroGram: 5 };

export const isNutritionallyTrivial = (meal) => {
    const calories = toNullableNumber(meal?.calories) ?? 0;
    if (calories > TRIVIAL_MEAL_LIMITS.calories) return false;

    for (const key of BASE_MACRO_KEYS) {
        const value = toNullableNumber(meal?.macros?.[key]) ?? 0;
        if (value > TRIVIAL_MEAL_LIMITS.macroGram) return false;
    }
    return true;
};

/**
 * 表示・判定用の代表値。aggregate 定義に従って合計 or 平均を返す。
 * 記録が1件も無ければ null（0 を返してはいけない）。
 */
export const getNutrientValue = (totals, key) => {
    if (!hasNutrientData(totals, key)) return null;
    const def = getNutrientDef(key);
    return def?.aggregate === 'avg' ? getNutrientAverage(totals, key) : totals[key];
};
