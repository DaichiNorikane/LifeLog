/**
 * コンディションスコアのルール定数（チューニング用の唯一の場所）
 *
 * ここには**データだけ**を置き、判定ロジックは conditionEngine.js に置く。
 * 重みを変えたい時にロジックを読まなくて済むようにするため。
 *
 * 【重要】この表の初期値は一般的な栄養学からの出発点にすぎない。
 * Phase 4 の相関分析で個人係数がかかると、実際の重みはユーザーごとに変わる。
 */

/** ルール改訂のたびに +1。過去の予測スナップショットと区別するため */
export const ENGINE_VERSION = 1;

/** 各軸の出発点。ここから加減算する */
export const BASE_SCORE = 60;

export const AXES = ['focus', 'sleep', 'energy', 'mood'];

export const AXIS_LABELS = {
    focus: '集中力',
    sleep: '睡眠',
    energy: 'エネルギー',
    mood: 'メンタル',
};

export const AXIS_DESCRIPTIONS = {
    focus: '脳の冴え・午後の眠気の少なさ',
    sleep: '今夜の寝つき・深さ',
    energy: '一日を通した安定感',
    mood: '気分の安定・ストレス耐性',
};

// ========== グレード ==========

export const GRADES = {
    great: { label: '絶好調', color: '#68D391', min: 85 },
    good: { label: 'good', color: '#9AE6B4', min: 70 },
    normal: { label: 'ふつう', color: '#F6E05E', min: 55 },
    warn: { label: '注意', color: '#F6AD55', min: 40 },
    bad: { label: '要改善', color: '#FC8181', min: 0 },
};

export const getGrade = (score) => {
    if (score === null || score === undefined || Number.isNaN(score)) return null;
    if (score >= GRADES.great.min) return 'great';
    if (score >= GRADES.good.min) return 'good';
    if (score >= GRADES.normal.min) return 'normal';
    if (score >= GRADES.warn.min) return 'warn';
    return 'bad';
};

// ========== 微量栄養素の帯域 ==========
// AI 推定の絶対値は当てにならないので、ピンポイント判定はせず 低/標準/高 の3帯域で扱う。
// 単位は EXTENDED_NUTRIENTS の定義に準拠（1日合計値に対して判定する）。

export const NUTRIENT_BANDS = {
    fiber: { low: 15, high: 25 },          // g
    iron: { low: 7, high: 15 },            // mg
    magnesium: { low: 250, high: 450 },    // mg
    omega3: { low: 250, high: 1000 },      // mg
    tryptophan: { low: 200, high: 600 },   // mg
    vitaminD: { low: 5, high: 20 },        // µg
    saturatedFat: { low: 12, high: 22 },   // g
};

/** 値がどの帯域か。未記録（null）は判定しない */
export const getBand = (key, value) => {
    const band = NUTRIENT_BANDS[key];
    if (!band || value === null || value === undefined) return null;
    if (value < band.low) return 'low';
    if (value > band.high) return 'high';
    return 'normal';
};

// ========== ドライバーの重み ==========
// 同じドライバーが複数の軸に効くことがあるため、軸ごとに定義する。

export const DRIVER_WEIGHTS = {
    focus: {
        breakfast_protein: 8,
        breakfast_skipped: -10,
        lunch_carb_bomb: -15,
        lunch_heavy: -8,
        omega3_sufficient: 6,
        iron_low: -6,
        saturated_fat_high: -5,
        caffeine_morning: 5,
        caffeine_excess: -5,
        sodium_potassium_imbalance: -4,
    },
    sleep: {
        late_meal: -15,
        late_meal_fatty: -8,
        alcohol_moderate: -18,
        alcohol_heavy: -25,
        caffeine_late: -12,          // 1杯ごと。CAPS.caffeineLate で下限
        tryptophan_carb_combo: 6,
        magnesium_sufficient: 5,
        dinner_carb_excess: -5,
        dinner_light_early: 8,
    },
    energy: {
        meal_gap_long: -8,
        fiber_sufficient: 8,
        sugar_fiber_ratio_bad: -10,  // 1食ごと。CAPS.sugarFiber で下限
        protein_sufficient: 6,
        calorie_deficit_severe: -12,
        magnesium_iron_low: -6,
        ultra_processed_high: -8,
    },
    mood: {
        fiber_sufficient: 7,
        fermented_food: 5,
        omega3_sufficient: 6,
        vitaminD_sufficient: 4,
        ultra_processed_high: -10,
        alcohol_moderate: -8,
        calorie_deficit_severe: -10,
    },
};

/** 積み上がりすぎを防ぐ下限（1ドライバーあたりの合計） */
export const CAPS = {
    caffeineLate: -25,
    sugarFiber: -20,
};

export const DRIVER_LABELS = {
    breakfast_protein: '朝食のタンパク質',
    breakfast_skipped: '朝食抜き',
    lunch_carb_bomb: '昼の糖質単独',
    lunch_heavy: '昼食が重い',
    omega3_sufficient: 'オメガ3が十分',
    iron_low: '鉄が不足気味',
    saturated_fat_high: '飽和脂肪酸が多い',
    caffeine_morning: '午前のカフェイン',
    caffeine_excess: 'カフェイン過多',
    sodium_potassium_imbalance: '塩分過多・カリウム不足',
    late_meal: '就寝直前の食事',
    late_meal_fatty: '就寝直前の脂っこい食事',
    alcohol_moderate: 'アルコール',
    alcohol_heavy: 'アルコール（多量）',
    caffeine_late: '午後以降のカフェイン',
    tryptophan_carb_combo: '夕食のトリプトファン',
    magnesium_sufficient: 'マグネシウムが十分',
    dinner_carb_excess: '夕食の糖質過多',
    dinner_light_early: '早めの軽い夕食',
    meal_gap_long: '食事間隔が長い',
    fiber_sufficient: '食物繊維が十分',
    sugar_fiber_ratio_bad: '糖質に対して繊維が少ない',
    protein_sufficient: 'タンパク質が十分',
    calorie_deficit_severe: 'カロリー不足',
    magnesium_iron_low: 'ミネラル不足',
    ultra_processed_high: '超加工食品が多い',
    fermented_food: '発酵食品',
    vitaminD_sufficient: 'ビタミンDが十分',
};

// ========== 判定閾値 ==========

export const THRESHOLDS = {
    // focus
    breakfastProteinG: 20,
    breakfastDeadlineHour: 11,       // 論理時刻。これを過ぎて記録が無ければ欠食
    lunchGlycemicLoadHigh: 20,
    lunchProteinLowG: 15,
    lunchFiberLowG: 5,
    lunchHeavyRatio: 0.45,           // 1日目標カロリーに対する比率
    caffeineMorningFromHour: 6,
    caffeineMorningToHour: 14,
    caffeineMorningMinMg: 50,
    caffeineMorningMaxMg: 300,
    caffeineDailyExcessMg: 400,
    sodiumHighMg: 3500,
    potassiumLowMg: 2000,

    // sleep
    caffeineLateFromHour: 14,
    lateMealHours: 3,                // 就寝までこの時間を切っていたら遅い食事
    lateMealFatG: 25,
    alcoholModerateG: 20,
    alcoholHeavyG: 40,
    dinnerTryptophanMg: 250,
    dinnerComboCarbMinG: 20,
    dinnerComboCarbMaxG: 60,
    magnesiumSufficientMg: 300,
    dinnerCarbExcessG: 120,
    dinnerLightEarlyHours: 4,
    dinnerLightEarlyKcal: 700,

    // energy
    mealGapHours: 6,
    fiberSufficientG: 20,
    sugarFiberRatio: 15,
    proteinPerKg: 1.2,
    proteinFallbackG: 60,            // 体重未登録時のフォールバック
    calorieDeficitRatio: 0.7,
    ultraProcessedHigh: 2.0,

    // mood
    omega3SufficientMg: 500,
    vitaminDSufficientUg: 8,

    // 共通
    dayCompleteHour: 21,             // これ以降は「1日が終わった」とみなす
};

/** 発酵食品の判定（食品名ベース。AI の推定に頼らず確実に拾えるものだけ） */
export const FERMENTED_FOOD_PATTERN =
    /納豆|味噌|みそ|味噌汁|ヨーグルト|キムチ|ぬか漬け|甘酒|塩麹|醤油麹|チーズ|ケフィア|テンペ|ザワークラウト/;

// ========== confidence ==========

/** 各軸のスコアが依存する栄養素。記録率から confidence を出す */
export const AXIS_NUTRIENTS = {
    focus: ['omega3', 'iron', 'saturatedFat', 'caffeine', 'glycemicLoad', 'fiber', 'sodium', 'potassium'],
    sleep: ['caffeine', 'alcohol', 'tryptophan', 'magnesium'],
    energy: ['fiber', 'sugar', 'ultraProcessed', 'magnesium', 'iron'],
    mood: ['fiber', 'omega3', 'vitaminD', 'ultraProcessed', 'alcohol'],
};

export const CONFIDENCE_RULES = {
    high: { minMeals: 3, minCoverage: 0.7 },
    medium: { minMeals: 2, minCoverage: 0.4 },
    // これを下回ると 'insufficient'（スコアを出さない）
    minimum: { minMeals: 1, minCoverage: 0.2 },
};

export const CONFIDENCE_LABELS = {
    high: '',
    medium: '',
    low: '参考値',
    insufficient: '判定不可',
};
