/**
 * 標準のマイドリンク（既定プリセット）
 *
 * 「コーヒー」という料理名から AI にカフェイン量を推定させても精度が出ない。
 * カフェインと就寝時刻は睡眠スコアの主要ドライバーなので、
 * よく飲むものは**固定値**を持たせて推定を挟まないようにする。
 *
 * caffeine (mg) / alcohol (g) は「含まないことが明らか」なものも 0 を明示する。
 * （null = 不明 と区別するため。ここは全て既知の値）
 */
export const DEFAULT_DRINK_PRESETS = [
    {
        key: 'coffee', name: 'コーヒー（ブラック）', emoji: '☕',
        calories: 5,
        macros: { protein: 0.2, fat: 0, carbs: 0.7, caffeine: 90, alcohol: 0, ultraProcessed: 0 },
    },
    {
        key: 'latte', name: 'カフェラテ', emoji: '🥛',
        calories: 100,
        macros: { protein: 5, fat: 5, carbs: 8, caffeine: 80, alcohol: 0, ultraProcessed: 1 },
    },
    {
        key: 'green-tea', name: '緑茶', emoji: '🍵',
        calories: 0,
        macros: { protein: 0, fat: 0, carbs: 0, caffeine: 30, alcohol: 0, ultraProcessed: 0 },
    },
    {
        key: 'black-tea', name: '紅茶', emoji: '🫖',
        calories: 0,
        macros: { protein: 0, fat: 0, carbs: 0, caffeine: 40, alcohol: 0, ultraProcessed: 0 },
    },
    {
        key: 'energy-drink', name: 'エナジードリンク', emoji: '⚡',
        calories: 210,
        macros: { protein: 0, fat: 0, carbs: 51, sugar: 51, caffeine: 140, alcohol: 0, ultraProcessed: 3 },
    },
    {
        key: 'water', name: '水・麦茶', emoji: '💧',
        calories: 0,
        macros: { protein: 0, fat: 0, carbs: 0, caffeine: 0, alcohol: 0, ultraProcessed: 0 },
    },
    {
        key: 'beer', name: 'ビール（500ml）', emoji: '🍺',
        calories: 200,
        macros: { protein: 1.5, fat: 0, carbs: 15.5, caffeine: 0, alcohol: 20, ultraProcessed: 1 },
    },
    {
        key: 'highball', name: 'ハイボール', emoji: '🥃',
        calories: 100,
        macros: { protein: 0, fat: 0, carbs: 0, caffeine: 0, alcohol: 14, ultraProcessed: 1 },
    },
    {
        key: 'wine', name: 'ワイン（1杯）', emoji: '🍷',
        calories: 90,
        macros: { protein: 0.1, fat: 0, carbs: 1.5, caffeine: 0, alcohol: 12, ultraProcessed: 1 },
    },
];

/** プリセットを食事レコードに変換する（飲み物も meals に入れて時刻ごと集計できるようにする） */
export const drinkPresetToMeal = (preset) => ({
    foodName: preset.name,
    calories: Number(preset.calories) || 0,
    macros: { ...(preset.macros || {}) },
    mealType: 'snack',
    source: 'drink-preset',
});
