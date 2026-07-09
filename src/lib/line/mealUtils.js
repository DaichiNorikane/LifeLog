import { randomUUID } from 'crypto';

export const MEAL_TYPE_LABELS = {
    breakfast: '朝食',
    lunch: '昼食',
    dinner: '夕食',
    snack: '間食',
};

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

export const createSid = () => randomUUID();
