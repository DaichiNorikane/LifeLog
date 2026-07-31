/**
 * コンディションスコアエンジン（決定論・純粋関数）
 *
 * 【設計の中核】スコアはここで確定させ、AI には一切計算させない。
 *   - 再現性: 同じ食事なら常に同じスコア。日によってブレない
 *   - 説明可能性: 「なぜ42点か」を必ずドライバー一覧で示せる
 *   - コスト: API 呼び出しゼロ。食事追加のたびに即時再計算できる
 *   - テスト可能性: 純粋関数なので網羅的に検証できる
 * AI（Phase 3）はこの出力を「解釈」して物語にするだけ。
 *
 * 重み・閾値は conditionRules.js にある。ここにはロジックだけを置く。
 */
import {
    ENGINE_VERSION, BASE_SCORE, AXES, DRIVER_WEIGHTS, DRIVER_LABELS,
    THRESHOLDS, CAPS, FERMENTED_FOOD_PATTERN, AXIS_NUTRIENTS,
    CONFIDENCE_RULES, getGrade, getBand,
} from './conditionRules';
import {
    sumMacroTotals, getNutrientValue, hasNutrientData, toNullableNumber,
} from './nutrients';
import {
    getLogicalHour, resolveBedtime, hoursUntilBedtime, filterMealsForLogicalDate,
} from './conditionDate';

export { ENGINE_VERSION };

// ========== 入力の前処理 ==========

const mealsOfType = (meals, type) => meals.filter(m => m.mealType === type);

const sumCalories = (meals) =>
    meals.reduce((acc, m) => acc + (toNullableNumber(m.calories) ?? 0), 0);

const sumMacro = (meals, key) =>
    meals.reduce((acc, m) => acc + (toNullableNumber(m.macros?.[key]) ?? 0), 0);

/**
 * 判定に必要な文脈を1度だけ組み立てる。
 * ドライバーはこの ctx だけを見る（副作用も再計算もしない）。
 */
const buildContext = ({ dateKey, meals, profile, now, driverWeights }) => {
    const dayMeals = filterMealsForLogicalDate(meals, dateKey);
    const totals = sumMacroTotals(dayMeals);

    // 就寝時刻は**既定値で補完しない**。
    // 推測した就寝時刻で 15点も減点するのは「推測で減点しない」原則に反する。
    // 未設定なら late_meal 系は発火せず、sleep の confidence が low に落ちる。
    // （UI の入力欄には既定値 01:00 を表示するので、設定は1タップで済む）
    const bedtime = profile?.bedtime || null;
    const bedtimeResolved = bedtime ? resolveBedtime(dateKey, bedtime) : null;

    const currentHour = getLogicalHour(now);
    const dinners = mealsOfType(dayMeals, 'dinner');

    return {
        dateKey,
        now,
        driverWeights: driverWeights || null,
        meals: dayMeals,
        totals,
        profile: profile || {},
        bedtimeResolved,
        currentHour,
        breakfast: mealsOfType(dayMeals, 'breakfast'),
        lunch: mealsOfType(dayMeals, 'lunch'),
        dinner: dinners,
        targetCalories: toNullableNumber(profile?.targetCalories),
        bodyWeight: toNullableNumber(profile?.currentWeight),
        // 1日の判定を確定させてよいか。夕食が記録済み、または夜遅い時刻
        isDayComplete: dinners.length > 0 || currentHour >= THRESHOLDS.dayCompleteHour,
        nutrient: (key) => getNutrientValue(totals, key),
        hoursToBed: (meal) => (bedtimeResolved ? hoursUntilBedtime(meal.timestamp, dateKey, bedtime) : null),
    };
};

// ========== ドライバー定義 ==========
// 各関数は「発火しない → null」「発火 → { delta, detail }」を返す。
// delta は DRIVER_WEIGHTS から取り、係数（回数など）だけをここで決める。

const w = (axis, key) => DRIVER_WEIGHTS[axis][key];

const FOCUS_DRIVERS = {
    breakfast_protein: (ctx) => {
        if (ctx.breakfast.length === 0) return null;
        const protein = sumMacro(ctx.breakfast, 'protein');
        if (protein < THRESHOLDS.breakfastProteinG) return null;
        return { delta: w('focus', 'breakfast_protein'), detail: `朝食で${Math.round(protein)}g` };
    },

    breakfast_skipped: (ctx) => {
        // まだ朝の時間帯なら「抜いた」と決めつけない
        if (ctx.currentHour < THRESHOLDS.breakfastDeadlineHour) return null;
        if (ctx.breakfast.length > 0) return null;
        // 朝食タイプが無くても、午前中に何か食べていれば欠食ではない
        const ateInMorning = ctx.meals.some(m => getLogicalHour(new Date(m.timestamp)) < THRESHOLDS.breakfastDeadlineHour);
        if (ateInMorning) return null;
        return { delta: w('focus', 'breakfast_skipped'), detail: '午前中の記録なし' };
    },

    lunch_carb_bomb: (ctx) => {
        if (ctx.lunch.length === 0) return null;
        const gl = ctx.lunch.reduce((acc, m) => acc + (toNullableNumber(m.macros?.glycemicLoad) ?? 0), 0);
        const hasGl = ctx.lunch.some(m => m.macros?.glycemicLoad != null);
        if (!hasGl || gl < THRESHOLDS.lunchGlycemicLoadHigh) return null;

        const protein = sumMacro(ctx.lunch, 'protein');
        const hasFiber = ctx.lunch.some(m => m.macros?.fiber != null);
        const fiber = sumMacro(ctx.lunch, 'fiber');
        if (protein >= THRESHOLDS.lunchProteinLowG) return null;
        if (hasFiber && fiber >= THRESHOLDS.lunchFiberLowG) return null;

        return { delta: w('focus', 'lunch_carb_bomb'), detail: `昼の血糖負荷 約${Math.round(gl)}` };
    },

    lunch_heavy: (ctx) => {
        if (ctx.lunch.length === 0 || !ctx.targetCalories) return null;
        const cals = sumCalories(ctx.lunch);
        if (cals < ctx.targetCalories * THRESHOLDS.lunchHeavyRatio) return null;
        return { delta: w('focus', 'lunch_heavy'), detail: `昼だけで${Math.round(cals)}kcal` };
    },

    omega3_sufficient: (ctx) => {
        const value = ctx.nutrient('omega3');
        if (value === null || value < THRESHOLDS.omega3SufficientMg) return null;
        return { delta: w('focus', 'omega3_sufficient'), detail: `${Math.round(value)}mg` };
    },

    iron_low: (ctx) => {
        if (!ctx.isDayComplete) return null;   // 日の途中で不足を責めない
        if (getBand('iron', ctx.nutrient('iron')) !== 'low') return null;
        return { delta: w('focus', 'iron_low'), detail: `${Math.round(ctx.nutrient('iron'))}mg` };
    },

    saturated_fat_high: (ctx) => {
        if (getBand('saturatedFat', ctx.nutrient('saturatedFat')) !== 'high') return null;
        return { delta: w('focus', 'saturated_fat_high'), detail: `${Math.round(ctx.nutrient('saturatedFat'))}g` };
    },

    caffeine_morning: (ctx) => {
        const morning = ctx.meals.filter((m) => {
            const hour = getLogicalHour(new Date(m.timestamp));
            const caffeine = toNullableNumber(m.macros?.caffeine);
            return caffeine !== null && caffeine > 0
                && hour >= THRESHOLDS.caffeineMorningFromHour
                && hour < THRESHOLDS.caffeineMorningToHour;
        });
        if (morning.length === 0) return null;
        const mg = sumMacro(morning, 'caffeine');
        if (mg < THRESHOLDS.caffeineMorningMinMg || mg > THRESHOLDS.caffeineMorningMaxMg) return null;
        return { delta: w('focus', 'caffeine_morning'), detail: `午前に${Math.round(mg)}mg` };
    },

    caffeine_excess: (ctx) => {
        const value = ctx.nutrient('caffeine');
        if (value === null || value <= THRESHOLDS.caffeineDailyExcessMg) return null;
        return { delta: w('focus', 'caffeine_excess'), detail: `1日${Math.round(value)}mg` };
    },

    sodium_potassium_imbalance: (ctx) => {
        if (!ctx.isDayComplete) return null;
        const sodium = ctx.nutrient('sodium');
        const potassium = ctx.nutrient('potassium');
        if (sodium === null || potassium === null) return null;
        if (sodium < THRESHOLDS.sodiumHighMg || potassium > THRESHOLDS.potassiumLowMg) return null;
        return { delta: w('focus', 'sodium_potassium_imbalance'), detail: 'ナトリウム過多' };
    },
};

const SLEEP_DRIVERS = {
    late_meal: (ctx) => {
        if (!ctx.bedtimeResolved) return null;   // 就寝時刻不明なら推測で減点しない
        const late = ctx.meals.filter((m) => {
            const hours = ctx.hoursToBed(m);
            return hours !== null && hours < THRESHOLDS.lateMealHours;
        });
        if (late.length === 0) return null;
        const closest = Math.min(...late.map(m => ctx.hoursToBed(m)));
        return {
            delta: w('sleep', 'late_meal'),
            detail: `就寝${closest <= 0 ? '後' : `${closest.toFixed(1)}時間前`}に食事`,
        };
    },

    late_meal_fatty: (ctx) => {
        if (!ctx.bedtimeResolved) return null;
        const lateFatty = ctx.meals.filter((m) => {
            const hours = ctx.hoursToBed(m);
            const fat = toNullableNumber(m.macros?.fat) ?? 0;
            return hours !== null && hours < THRESHOLDS.lateMealHours && fat > THRESHOLDS.lateMealFatG;
        });
        if (lateFatty.length === 0) return null;
        return { delta: w('sleep', 'late_meal_fatty'), detail: '就寝前に脂質の多い食事' };
    },

    alcohol_moderate: (ctx) => {
        const value = ctx.nutrient('alcohol');
        if (value === null || value < THRESHOLDS.alcoholModerateG) return null;
        if (value >= THRESHOLDS.alcoholHeavyG) return null;   // heavy 側で扱う
        return { delta: w('sleep', 'alcohol_moderate'), detail: `純アルコール${Math.round(value)}g` };
    },

    alcohol_heavy: (ctx) => {
        const value = ctx.nutrient('alcohol');
        if (value === null || value < THRESHOLDS.alcoholHeavyG) return null;
        return { delta: w('sleep', 'alcohol_heavy'), detail: `純アルコール${Math.round(value)}g` };
    },

    caffeine_late: (ctx) => {
        const late = ctx.meals.filter((m) => {
            const caffeine = toNullableNumber(m.macros?.caffeine);
            return caffeine !== null && caffeine > 0
                && getLogicalHour(new Date(m.timestamp)) >= THRESHOLDS.caffeineLateFromHour;
        });
        if (late.length === 0) return null;
        const raw = w('sleep', 'caffeine_late') * late.length;
        return {
            delta: Math.max(raw, CAPS.caffeineLate),
            detail: `14時以降に${late.length}回`,
        };
    },

    tryptophan_carb_combo: (ctx) => {
        if (ctx.dinner.length === 0) return null;
        const hasTryptophan = ctx.dinner.some(m => m.macros?.tryptophan != null);
        if (!hasTryptophan) return null;
        const tryptophan = sumMacro(ctx.dinner, 'tryptophan');
        if (tryptophan < THRESHOLDS.dinnerTryptophanMg) return null;
        const carbs = sumMacro(ctx.dinner, 'carbs');
        if (carbs < THRESHOLDS.dinnerComboCarbMinG || carbs > THRESHOLDS.dinnerComboCarbMaxG) return null;
        return { delta: w('sleep', 'tryptophan_carb_combo'), detail: '夕食の組み合わせが良好' };
    },

    magnesium_sufficient: (ctx) => {
        const value = ctx.nutrient('magnesium');
        if (value === null || value < THRESHOLDS.magnesiumSufficientMg) return null;
        return { delta: w('sleep', 'magnesium_sufficient'), detail: `${Math.round(value)}mg` };
    },

    dinner_carb_excess: (ctx) => {
        if (ctx.dinner.length === 0) return null;
        const carbs = sumMacro(ctx.dinner, 'carbs');
        if (carbs <= THRESHOLDS.dinnerCarbExcessG) return null;
        return { delta: w('sleep', 'dinner_carb_excess'), detail: `夕食で炭水化物${Math.round(carbs)}g` };
    },

    dinner_light_early: (ctx) => {
        if (ctx.dinner.length === 0 || !ctx.bedtimeResolved) return null;
        const cals = sumCalories(ctx.dinner);
        if (cals >= THRESHOLDS.dinnerLightEarlyKcal) return null;
        // 最も就寝に近い夕食で判定する（それが4時間以上前なら全ての夕食が早い）
        const closestGap = Math.min(...ctx.dinner.map(m => ctx.hoursToBed(m) ?? -Infinity));
        if (closestGap < THRESHOLDS.dinnerLightEarlyHours) return null;
        return { delta: w('sleep', 'dinner_light_early'), detail: `就寝${closestGap.toFixed(1)}時間前に${Math.round(cals)}kcal` };
    },
};

const ENERGY_DRIVERS = {
    meal_gap_long: (ctx) => {
        if (ctx.meals.length < 2) return null;
        let maxGap = 0;
        for (let i = 1; i < ctx.meals.length; i += 1) {
            const gap = (new Date(ctx.meals[i].timestamp) - new Date(ctx.meals[i - 1].timestamp)) / 3600000;
            if (gap > maxGap) maxGap = gap;
        }
        if (maxGap <= THRESHOLDS.mealGapHours) return null;
        return { delta: w('energy', 'meal_gap_long'), detail: `最大${maxGap.toFixed(1)}時間の空き` };
    },

    fiber_sufficient: (ctx) => {
        const value = ctx.nutrient('fiber');
        if (value === null || value < THRESHOLDS.fiberSufficientG) return null;
        return { delta: w('energy', 'fiber_sufficient'), detail: `${Math.round(value)}g` };
    },

    sugar_fiber_ratio_bad: (ctx) => {
        const bad = ctx.meals.filter((m) => {
            const sugar = toNullableNumber(m.macros?.sugar);
            const fiber = toNullableNumber(m.macros?.fiber);
            if (sugar === null || fiber === null) return false;
            // fiber 0 での 0除算を避けつつ、繊維ゼロを最も悪く扱う
            return sugar / Math.max(fiber, 1) > THRESHOLDS.sugarFiberRatio;
        });
        if (bad.length === 0) return null;
        const raw = w('energy', 'sugar_fiber_ratio_bad') * bad.length;
        return { delta: Math.max(raw, CAPS.sugarFiber), detail: `${bad.length}食で偏り` };
    },

    protein_sufficient: (ctx) => {
        const required = ctx.bodyWeight
            ? ctx.bodyWeight * THRESHOLDS.proteinPerKg
            : THRESHOLDS.proteinFallbackG;
        if (ctx.totals.protein < required) return null;
        return { delta: w('energy', 'protein_sufficient'), detail: `${Math.round(ctx.totals.protein)}g` };
    },

    calorie_deficit_severe: (ctx) => {
        if (!ctx.isDayComplete || !ctx.targetCalories) return null;
        if (ctx.totals.calories >= ctx.targetCalories * THRESHOLDS.calorieDeficitRatio) return null;
        return {
            delta: w('energy', 'calorie_deficit_severe'),
            detail: `目標${Math.round(ctx.targetCalories)}に対し${Math.round(ctx.totals.calories)}kcal`,
        };
    },

    magnesium_iron_low: (ctx) => {
        if (!ctx.isDayComplete) return null;
        if (getBand('magnesium', ctx.nutrient('magnesium')) !== 'low') return null;
        if (getBand('iron', ctx.nutrient('iron')) !== 'low') return null;
        return { delta: w('energy', 'magnesium_iron_low'), detail: 'マグネシウム・鉄ともに不足' };
    },

    ultra_processed_high: (ctx) => {
        const value = ctx.nutrient('ultraProcessed');
        if (value === null || value < THRESHOLDS.ultraProcessedHigh) return null;
        return { delta: w('energy', 'ultra_processed_high'), detail: `平均${value.toFixed(1)}/3` };
    },
};

const MOOD_DRIVERS = {
    fiber_sufficient: (ctx) => {
        const value = ctx.nutrient('fiber');
        if (value === null || value < THRESHOLDS.fiberSufficientG) return null;
        return { delta: w('mood', 'fiber_sufficient'), detail: `${Math.round(value)}g` };
    },

    fermented_food: (ctx) => {
        const found = ctx.meals.filter(m => FERMENTED_FOOD_PATTERN.test(m.foodName || ''));
        if (found.length === 0) return null;
        return { delta: w('mood', 'fermented_food'), detail: found[0].foodName };
    },

    omega3_sufficient: (ctx) => {
        const value = ctx.nutrient('omega3');
        if (value === null || value < THRESHOLDS.omega3SufficientMg) return null;
        return { delta: w('mood', 'omega3_sufficient'), detail: `${Math.round(value)}mg` };
    },

    vitaminD_sufficient: (ctx) => {
        const value = ctx.nutrient('vitaminD');
        if (value === null || value < THRESHOLDS.vitaminDSufficientUg) return null;
        return { delta: w('mood', 'vitaminD_sufficient'), detail: `${value.toFixed(1)}µg` };
    },

    ultra_processed_high: (ctx) => {
        const value = ctx.nutrient('ultraProcessed');
        if (value === null || value < THRESHOLDS.ultraProcessedHigh) return null;
        return { delta: w('mood', 'ultra_processed_high'), detail: `平均${value.toFixed(1)}/3` };
    },

    alcohol_moderate: (ctx) => {
        const value = ctx.nutrient('alcohol');
        if (value === null || value < THRESHOLDS.alcoholModerateG) return null;
        return { delta: w('mood', 'alcohol_moderate'), detail: `純アルコール${Math.round(value)}g` };
    },

    calorie_deficit_severe: (ctx) => {
        if (!ctx.isDayComplete || !ctx.targetCalories) return null;
        if (ctx.totals.calories >= ctx.targetCalories * THRESHOLDS.calorieDeficitRatio) return null;
        return { delta: w('mood', 'calorie_deficit_severe'), detail: '極端な不足' };
    },
};

const DRIVERS_BY_AXIS = {
    focus: FOCUS_DRIVERS,
    sleep: SLEEP_DRIVERS,
    energy: ENERGY_DRIVERS,
    mood: MOOD_DRIVERS,
};

// ========== confidence ==========

/**
 * その軸のスコアをどれだけ信用してよいか。
 * データが薄い日に数値を出すのが最大の信用毀損なので、必ずここでガードする。
 */
export const computeConfidence = (ctx, axis) => {
    const mealCount = ctx.meals.length;
    if (mealCount === 0) return 'insufficient';

    const keys = AXIS_NUTRIENTS[axis];
    const recorded = keys.filter(key => hasNutrientData(ctx.totals, key)).length;
    const coverage = keys.length === 0 ? 0 : recorded / keys.length;

    const { high, medium, minimum } = CONFIDENCE_RULES;
    if (mealCount < minimum.minMeals || coverage < minimum.minCoverage) return 'insufficient';

    let level = 'low';
    if (mealCount >= medium.minMeals && coverage >= medium.minCoverage) level = 'medium';
    if (mealCount >= high.minMeals && coverage >= high.minCoverage) level = 'high';

    // 就寝時刻が分からないと睡眠の主要ドライバーが発火しないため頭打ちにする
    if (axis === 'sleep' && !ctx.bedtimeResolved && level !== 'low') return 'low';

    return level;
};

// ========== 本体 ==========

const clamp = (value) => Math.max(0, Math.min(100, value));

const evaluateAxis = (ctx, axis) => {
    const confidence = computeConfidence(ctx, axis);
    if (confidence === 'insufficient') {
        return { score: null, grade: null, confidence, drivers: [] };
    }

    const drivers = [];
    for (const [key, detect] of Object.entries(DRIVERS_BY_AXIS[axis])) {
        const hit = detect(ctx);
        if (!hit || !hit.delta) continue;

        // 個人係数（Phase 4 の相関分析が入れる）。未学習なら 1 のまま。
        const coefficient = ctx.driverWeights?.[axis]?.[key] ?? 1;
        const delta = Math.round(hit.delta * coefficient);
        if (!delta) continue;

        drivers.push({
            key,
            label: DRIVER_LABELS[key] || key,
            delta,
            detail: hit.detail || null,
            personalized: coefficient !== 1,
        });
    }

    const raw = drivers.reduce((acc, d) => acc + d.delta, BASE_SCORE);
    const score = Math.round(clamp(raw));

    // 影響の大きい順に並べる（UI は上から数件だけ出せばよくなる）
    drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return { score, grade: getGrade(score), confidence, drivers };
};

/**
 * その論理日のコンディションを評価する。
 *
 * @param {object} input
 * @param {string} input.dateKey 論理日 (YYYY-MM-DD)
 * @param {Array}  input.meals   食事（他の日が混ざっていてもよい。内部で絞り込む）
 * @param {object} input.profile { bedtime, targetCalories, currentWeight }
 * @param {Date}   input.now     評価時点
 * @param {object} input.driverWeights 個人係数 { [axis]: { [driverKey]: 0.5〜1.5 } }。未学習なら省略
 */
export const evaluateCondition = ({ dateKey, meals = [], profile = {}, now = new Date(), driverWeights = null }) => {
    const ctx = buildContext({ dateKey, meals, profile, now, driverWeights });

    const axes = {};
    for (const axis of AXES) {
        axes[axis] = evaluateAxis(ctx, axis);
    }

    // 全軸を通じて最も効いた要因（エレナが語る主題になる）
    let topPositive = null;
    let topNegative = null;
    for (const axis of AXES) {
        for (const driver of axes[axis].drivers) {
            const candidate = { axis, ...driver };
            if (driver.delta > 0 && (!topPositive || driver.delta > topPositive.delta)) topPositive = candidate;
            if (driver.delta < 0 && (!topNegative || driver.delta < topNegative.delta)) topNegative = candidate;
        }
    }

    return {
        date: dateKey,
        axes,
        topPositive,
        topNegative,
        mealCount: ctx.meals.length,
        isDayComplete: ctx.isDayComplete,
        version: ENGINE_VERSION,
    };
};

/** Firestore へスナップショット保存する形（スコアだけ） */
export const toPredictedScores = (result) =>
    AXES.reduce((acc, axis) => {
        acc[axis] = result?.axes?.[axis]?.score ?? null;
        return acc;
    }, {});

/**
 * その日に発火したドライバーのキー一覧。
 *
 * スコアだけでは「どの要因が効いた日か」が分からず相関分析ができないため、
 * 予測スナップショットと一緒に保存する。
 * 後からルールを変えても過去の分析が壊れないという原則もここで守られる
 * （過去のメニューから再計算せず、当時発火した事実をそのまま残す）。
 */
export const toFiredDrivers = (result) =>
    AXES.reduce((acc, axis) => {
        acc[axis] = (result?.axes?.[axis]?.drivers || []).map(d => d.key);
        return acc;
    }, {});

/** 1軸でもスコアが出ているか（全部 insufficient ならカードを出さない） */
export const hasAnyScore = (result) =>
    AXES.some(axis => result?.axes?.[axis]?.score !== null && result?.axes?.[axis]?.score !== undefined);
