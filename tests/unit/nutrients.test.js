/**
 * Tests for src/lib/health/nutrients.js
 *
 * 最重要の不変条件: null（推定できなかった）と 0（実際にゼロ）を絶対に混同しない。
 */
import { describe, it, expect } from 'vitest';
import {
    EXTENDED_NUTRIENTS,
    EXTENDED_NUTRIENT_KEYS,
    MEAL_SCOPED_NUTRIENT_KEYS,
    EXTENDED_NUTRIENTS_INSTRUCTION,
    getNutrientDef,
    toNullableNumber,
    normalizeMacros,
    createMacroTotals,
    accumulateMacroTotals,
    sumMacroTotals,
    hasNutrientData,
    getNutrientAverage,
    getNutrientValue,
} from '@/lib/health/nutrients';

describe('EXTENDED_NUTRIENTS の定義', () => {
    it('キーが重複していない', () => {
        expect(new Set(EXTENDED_NUTRIENT_KEYS).size).toBe(EXTENDED_NUTRIENT_KEYS.length);
    });

    it('既存の4栄養素が残っている（後方互換）', () => {
        for (const key of ['fiber', 'sugar', 'sodium', 'potassium']) {
            expect(EXTENDED_NUTRIENT_KEYS).toContain(key);
        }
    });

    it('Tier1 のコンディション栄養素が揃っている', () => {
        for (const key of [
            'caffeine', 'alcohol', 'omega3', 'tryptophan', 'magnesium',
            'iron', 'vitaminD', 'saturatedFat', 'glycemicLoad', 'ultraProcessed',
        ]) {
            expect(EXTENDED_NUTRIENT_KEYS).toContain(key);
        }
    });

    it('全ての定義が label / unit / scope / aggregate / hint を持つ', () => {
        for (const def of EXTENDED_NUTRIENTS) {
            expect(def.label, def.key).toBeTruthy();
            expect(typeof def.unit, def.key).toBe('string');
            expect(['daily', 'meal'], def.key).toContain(def.scope);
            expect(['sum', 'avg'], def.key).toContain(def.aggregate);
            expect(def.hint, def.key).toBeTruthy();
        }
    });

    it('食事単位で判定する栄養素は時刻と結びつくものだけ', () => {
        expect(MEAL_SCOPED_NUTRIENT_KEYS).toEqual(
            expect.arrayContaining(['caffeine', 'alcohol', 'glycemicLoad', 'ultraProcessed'])
        );
        expect(MEAL_SCOPED_NUTRIENT_KEYS).not.toContain('iron');
    });

    it('getNutrientDef は未知のキーで null を返す', () => {
        expect(getNutrientDef('fiber')?.label).toBe('食物繊維');
        expect(getNutrientDef('unknown')).toBeNull();
    });
});

describe('EXTENDED_NUTRIENTS_INSTRUCTION', () => {
    it('全フィールドを列挙する', () => {
        for (const key of EXTENDED_NUTRIENT_KEYS) {
            expect(EXTENDED_NUTRIENTS_INSTRUCTION).toContain(`- ${key}:`);
        }
    });

    it('0 ではなく null を返すよう明示している', () => {
        expect(EXTENDED_NUTRIENTS_INSTRUCTION).toContain('null');
        expect(EXTENDED_NUTRIENTS_INSTRUCTION).toContain('0 と null の混同は厳禁');
    });
});

describe('toNullableNumber', () => {
    it('0 は 0 のまま保持する（null に潰さない）', () => {
        expect(toNullableNumber(0)).toBe(0);
    });

    it('undefined / null / 空文字 は null', () => {
        expect(toNullableNumber(undefined)).toBeNull();
        expect(toNullableNumber(null)).toBeNull();
        expect(toNullableNumber('  ')).toBeNull();
    });

    it('数値化できない値は null', () => {
        expect(toNullableNumber('abc')).toBeNull();
        expect(toNullableNumber(NaN)).toBeNull();
        expect(toNullableNumber(Infinity)).toBeNull();
    });

    it('数値文字列は数値に変換する', () => {
        expect(toNullableNumber('12.5')).toBe(12.5);
    });
});

describe('normalizeMacros', () => {
    it('基本マクロは数値、拡張栄養素は未指定なら null', () => {
        const result = normalizeMacros({ protein: 20, fat: 10, carbs: 30 });
        expect(result.protein).toBe(20);
        expect(result.fiber).toBeNull();
        expect(result.caffeine).toBeNull();
    });

    it('拡張栄養素の 0 は 0 のまま残す', () => {
        const result = normalizeMacros({ protein: 1, fat: 1, carbs: 1, caffeine: 0, alcohol: 0 });
        expect(result.caffeine).toBe(0);
        expect(result.alcohol).toBe(0);
    });

    it('基本マクロの不正値は 0 に落とす', () => {
        const result = normalizeMacros({ protein: 'abc', fat: undefined, carbs: null });
        expect(result.protein).toBe(0);
        expect(result.fat).toBe(0);
        expect(result.carbs).toBe(0);
    });

    it('引数なしでも全キーを持つオブジェクトを返す', () => {
        const result = normalizeMacros();
        for (const key of EXTENDED_NUTRIENT_KEYS) {
            expect(result).toHaveProperty(key, null);
        }
    });
});

describe('日次集計', () => {
    const meal = (calories, macros) => ({ calories, macros });

    it('初期値は全て 0 で Recorded も 0', () => {
        const totals = createMacroTotals();
        expect(totals.calories).toBe(0);
        for (const key of EXTENDED_NUTRIENT_KEYS) {
            expect(totals[key]).toBe(0);
            expect(totals[`${key}Recorded`]).toBe(0);
        }
    });

    it('null の栄養素はスキップし Recorded を増やさない', () => {
        const totals = sumMacroTotals([
            meal(500, { protein: 20, fat: 10, carbs: 60, fiber: 5 }),
            meal(300, { protein: 10, fat: 5, carbs: 40 }), // fiber なし
        ]);
        expect(totals.fiber).toBe(5);
        expect(totals.fiberRecorded).toBe(1);
    });

    it('0 が記録されている場合は Recorded を増やす（未取得と区別する）', () => {
        const totals = sumMacroTotals([meal(100, { protein: 0, fat: 0, carbs: 0, caffeine: 0 })]);
        expect(totals.caffeine).toBe(0);
        expect(totals.caffeineRecorded).toBe(1);
        expect(hasNutrientData(totals, 'caffeine')).toBe(true);
    });

    it('記録が1件も無ければ hasNutrientData は false', () => {
        const totals = sumMacroTotals([meal(100, { protein: 1, fat: 1, carbs: 1 })]);
        expect(hasNutrientData(totals, 'caffeine')).toBe(false);
    });

    it('カロリーと基本マクロを合算する', () => {
        const totals = sumMacroTotals([
            meal(500, { protein: 20, fat: 10, carbs: 60 }),
            meal(300, { protein: 10, fat: 5, carbs: 40 }),
        ]);
        expect(totals.calories).toBe(800);
        expect(totals.protein).toBe(30);
        expect(totals.fat).toBe(15);
        expect(totals.carbs).toBe(100);
    });

    it('macros が無い食事でも壊れない', () => {
        const totals = sumMacroTotals([{ calories: 200 }, {}]);
        expect(totals.calories).toBe(200);
        expect(totals.protein).toBe(0);
    });

    it('空配列なら初期値と同じ', () => {
        expect(sumMacroTotals([])).toEqual(createMacroTotals());
    });

    it('accumulateMacroTotals は元のオブジェクトを変更しない', () => {
        const base = createMacroTotals();
        const next = accumulateMacroTotals(base, meal(100, { protein: 5, fat: 1, carbs: 1 }));
        expect(base.calories).toBe(0);
        expect(next.calories).toBe(100);
    });
});

describe('代表値の取り出し', () => {
    const meals = [
        { calories: 100, macros: { protein: 1, fat: 1, carbs: 1, ultraProcessed: 3, fiber: 4 } },
        { calories: 100, macros: { protein: 1, fat: 1, carbs: 1, ultraProcessed: 1, fiber: 6 } },
    ];

    it('avg 集計型（超加工度）は平均を返す', () => {
        const totals = sumMacroTotals(meals);
        expect(getNutrientAverage(totals, 'ultraProcessed')).toBe(2);
        expect(getNutrientValue(totals, 'ultraProcessed')).toBe(2);
    });

    it('sum 集計型（食物繊維）は合計を返す', () => {
        const totals = sumMacroTotals(meals);
        expect(getNutrientValue(totals, 'fiber')).toBe(10);
    });

    it('記録が無ければ 0 ではなく null を返す', () => {
        const totals = sumMacroTotals([{ calories: 100, macros: { protein: 1, fat: 1, carbs: 1 } }]);
        expect(getNutrientValue(totals, 'iron')).toBeNull();
        expect(getNutrientAverage(totals, 'ultraProcessed')).toBeNull();
    });
});
