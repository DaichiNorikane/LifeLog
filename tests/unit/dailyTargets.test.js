import { describe, expect, it } from 'vitest';
import {
    NUTRIENT_TARGETS, evaluateAgainstTarget, getDailyNutrientTargets,
} from '@/lib/health/dailyTargets';

const byKey = (targets, key) => targets.find(t => t.key === key);

describe('NUTRIENT_TARGETS', () => {
    it('gives every nutrient a direction, a label and a source', () => {
        for (const target of NUTRIENT_TARGETS) {
            expect(['atLeast', 'atMost']).toContain(target.direction);
            expect(target.label).toBeTruthy();
            expect(target.unit).toBeTruthy();
            expect(target.source).toBeTruthy();
        }
    });

    it('has no duplicate keys', () => {
        const keys = NUTRIENT_TARGETS.map(t => t.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('getDailyNutrientTargets', () => {
    it('uses the male values for men', () => {
        const targets = getDailyNutrientTargets({ gender: 'male', targetCalories: 2000 });

        expect(byKey(targets, 'fiber').value).toBe(21);
        expect(byKey(targets, 'potassium').value).toBe(3000);
        expect(byKey(targets, 'iron').value).toBe(7.5);
        expect(byKey(targets, 'magnesium').value).toBe(370);
    });

    it('uses the female values for women', () => {
        const targets = getDailyNutrientTargets({ gender: 'female', targetCalories: 2000 });

        expect(byKey(targets, 'fiber').value).toBe(18);
        expect(byKey(targets, 'potassium').value).toBe(2600);
        // 鉄は女性のほうが多い（月経による損失があるため）
        expect(byKey(targets, 'iron').value).toBe(10.5);
        expect(byKey(targets, 'magnesium').value).toBe(290);
    });

    it('falls back to the male values when the gender is unknown', () => {
        // 既定を置かないと目標そのものが出せず、機能が丸ごと死ぬ
        expect(byKey(getDailyNutrientTargets({}), 'fiber').value).toBe(21);
        expect(byKey(getDailyNutrientTargets({ gender: 'other' }), 'fiber').value).toBe(21);
    });

    it('derives the sugar target from the calorie goal minus the fiber goal', () => {
        // 2000kcal × 50% ÷ 4 = 250g、そこから食物繊維 21g を引く
        expect(byKey(getDailyNutrientTargets({ gender: 'male', targetCalories: 2000 }), 'sugar').value).toBe(229);
        // 1600kcal なら 200 - 21
        expect(byKey(getDailyNutrientTargets({ gender: 'male', targetCalories: 1600 }), 'sugar').value).toBe(179);
    });

    it('uses a female fiber goal when deriving the female sugar goal', () => {
        expect(byKey(getDailyNutrientTargets({ gender: 'female', targetCalories: 2000 }), 'sugar').value).toBe(232);
    });

    it('falls back to 2000kcal when no calorie goal is set', () => {
        expect(byKey(getDailyNutrientTargets({ gender: 'male' }), 'sugar').value).toBe(229);
    });

    it('marks which way is good for each nutrient', () => {
        const targets = getDailyNutrientTargets({ gender: 'male', targetCalories: 2000 });

        expect(byKey(targets, 'fiber').direction).toBe('atLeast');
        expect(byKey(targets, 'potassium').direction).toBe('atLeast');
        expect(byKey(targets, 'omega3').direction).toBe('atLeast');
        expect(byKey(targets, 'sodium').direction).toBe('atMost');
        expect(byKey(targets, 'sugar').direction).toBe('atMost');
    });
});

describe('evaluateAgainstTarget', () => {
    const fiber = { value: 21, direction: 'atLeast' };
    const sodium = { value: 2950, direction: 'atMost' };

    it('calls a shortfall short for "more is better" nutrients', () => {
        const result = evaluateAgainstTarget(14, fiber);

        expect(result.status).toBe('short');
        expect(result.remaining).toBe(7);
        expect(Math.round(result.percent)).toBe(67);
    });

    it('calls it ok once the target is reached', () => {
        expect(evaluateAgainstTarget(21, fiber).status).toBe('ok');
        expect(evaluateAgainstTarget(30, fiber).status).toBe('ok');
    });

    it('calls an excess over for "less is better" nutrients', () => {
        const result = evaluateAgainstTarget(3420, sodium);

        expect(result.status).toBe('over');
        expect(result.remaining).toBe(-470);
    });

    it('calls a low value ok for "less is better" nutrients', () => {
        // 同じ低い割合でも、方向が違えば意味が逆になる
        expect(evaluateAgainstTarget(1200, sodium).status).toBe('ok');
        expect(evaluateAgainstTarget(1200, { value: 3000, direction: 'atLeast' }).status).toBe('short');
    });

    it('returns null for values that were never measured', () => {
        expect(evaluateAgainstTarget(null, fiber)).toBeNull();
        expect(evaluateAgainstTarget(undefined, fiber)).toBeNull();
        expect(evaluateAgainstTarget('たくさん', fiber)).toBeNull();
    });

    it('treats a real 0 as a measurement, not as missing', () => {
        const result = evaluateAgainstTarget(0, fiber);

        expect(result).not.toBeNull();
        expect(result.status).toBe('short');
        expect(result.percent).toBe(0);
    });

    it('returns null when there is no usable target', () => {
        expect(evaluateAgainstTarget(10, null)).toBeNull();
        expect(evaluateAgainstTarget(10, { value: 0, direction: 'atLeast' })).toBeNull();
    });
});
