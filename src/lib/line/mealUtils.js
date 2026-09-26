import { randomUUID } from 'crypto';

export const MEAL_TYPE_LABELS = {
    breakfast: '朝食',
    lunch: '昼食',
    dinner: '夕食',
    snack: '間食',
};

// ボタンを並べる順番。1日の流れと同じにしておく
export const MEAL_TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export const isMealType = (value) => Object.hasOwn(MEAL_TYPE_LABELS, String(value || ''));

const nullableNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isNaN(number) ? null : number;
};

const numberOrZero = (value) => {
    const number = Number(value);
    return Number.isNaN(number) ? 0 : number;
};

export const getJstHour = (date = new Date()) => {
    const hour = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(date));
    return Number(hour);
};

/**
 * 「これを昼に食べた」のような補足テキストから食事タイプを読み取る。
 * 見つからなければ null（呼び出し側が時間帯からの推定にフォールバックする）
 */
export const parseMealTypeHint = (text) => {
    const value = String(text || '');
    if (/朝|モーニング/.test(value)) return 'breakfast';
    if (/昼|ランチ/.test(value)) return 'lunch';
    if (/夕|夜|晩|ディナー/.test(value)) return 'dinner';
    if (/間食|おやつ|デザート/.test(value)) return 'snack';
    return null;
};

export const getMealTypeForJst = (date = new Date()) => {
    const hour = getJstHour(date);
    if (hour >= 4 && hour < 10) return 'breakfast';
    if (hour >= 10 && hour < 15) return 'lunch';
    if (hour >= 15 && hour < 18) return 'snack';
    return 'dinner';
};

export const normalizeMealForLine = (analysis, options = {}) => {
    const macros = analysis?.macros || {};
    return {
        foodName: String(analysis?.foodName || '食事').trim() || '食事',
        calories: Math.round(numberOrZero(analysis?.calories)),
        macros: {
            protein: numberOrZero(macros.protein),
            fat: numberOrZero(macros.fat),
            carbs: numberOrZero(macros.carbs),
            fiber: nullableNumber(macros.fiber),
            sugar: nullableNumber(macros.sugar),
            sodium: nullableNumber(macros.sodium),
            potassium: nullableNumber(macros.potassium),
        },
        breakdown: Array.isArray(analysis?.breakdown) ? analysis.breakdown : [],
        reasoning: analysis?.reasoning || '',
        image: null,
        mealType: options.mealType || getMealTypeForJst(options.date || new Date()),
        timestamp: options.timestamp || new Date().toISOString(),
    };
};

const sumNullable = (meals, key) => {
    const values = meals.map(meal => meal.macros?.[key]).filter(value => value !== null && value !== undefined);
    // 1品でも推定できていれば合計を出す。全品不明なら null（0 と区別する）
    return values.length ? Math.round(values.reduce((sum, value) => sum + Number(value), 0) * 10) / 10 : null;
};

const sumNumber = (meals, key) =>
    Math.round(meals.reduce((sum, meal) => sum + numberOrZero(meal.macros?.[key]), 0) * 10) / 10;

/**
 * 一緒に食べた複数の料理を「1回の食事」として合算する（評価と合計表示用。保存はしない）。
 * 保存は1品ずつ別の記録にするので、Web側の一覧・編集はこれまで通り1品単位で扱える。
 */
export const combineMeals = (meals = [], mealType) => ({
    foodName: meals.map(meal => meal.foodName).join('、'),
    calories: Math.round(meals.reduce((sum, meal) => sum + numberOrZero(meal.calories), 0)),
    macros: {
        protein: sumNumber(meals, 'protein'),
        fat: sumNumber(meals, 'fat'),
        carbs: sumNumber(meals, 'carbs'),
        fiber: sumNullable(meals, 'fiber'),
        sugar: sumNullable(meals, 'sugar'),
        sodium: sumNullable(meals, 'sodium'),
        potassium: sumNullable(meals, 'potassium'),
    },
    mealType: mealType || meals[0]?.mealType,
});

export const createSid = () => randomUUID();
