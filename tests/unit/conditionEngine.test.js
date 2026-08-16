/**
 * Tests for src/lib/health/conditionEngine.js
 *
 * このファイルが最重要。エンジンの数値は UI・エレナの発言・相関分析の全てが前提にする。
 * 各ドライバーの発火/非発火、境界値、clamp、confidence を網羅する。
 */
import { describe, it, expect } from 'vitest';
import {
    evaluateCondition,
    toPredictedScores,
    toFiredDrivers,
    hasAnyScore,
    ENGINE_VERSION,
} from '@/lib/health/conditionEngine';
import { BASE_SCORE, DRIVER_WEIGHTS, AXES } from '@/lib/health/conditionRules';

const DATE = '2026-07-29';
const PROFILE = { bedtime: '01:00', targetCalories: 2200, currentWeight: 70 };

/** JST の壁時計時刻で Date を作る */
const at = (hhmm, day = '2026-07-29') => new Date(`${day}T${hhmm}:00+09:00`);

/** 拡張栄養素が一通り埋まった食事（confidence を稼ぐための土台） */
const meal = (overrides = {}) => ({
    foodName: '食事',
    calories: 600,
    mealType: 'lunch',
    timestamp: at('12:00').toISOString(),
    ...overrides,
    macros: {
        protein: 25, fat: 15, carbs: 70,
        fiber: 6, sugar: 60, sodium: 800, potassium: 700,
        caffeine: 0, alcohol: 0, omega3: 100, tryptophan: 200,
        magnesium: 90, iron: 3, vitaminD: 2, saturatedFat: 5,
        glycemicLoad: 12, ultraProcessed: 1,
        ...(overrides.macros || {}),
    },
});

/** 標準的な3食（各ドライバーが素の状態で発火しないベースライン） */
const baseDay = () => [
    meal({ mealType: 'breakfast', timestamp: at('08:00').toISOString(), calories: 400 }),
    meal({ mealType: 'lunch', timestamp: at('12:30').toISOString(), calories: 600 }),
    meal({ mealType: 'dinner', timestamp: at('19:00').toISOString(), calories: 600 }),
];

const run = (meals, { profile = PROFILE, now = at('22:00') } = {}) =>
    evaluateCondition({ dateKey: DATE, meals, profile, now });

const driverKeys = (result, axis) => result.axes[axis].drivers.map(d => d.key);
const driver = (result, axis, key) => result.axes[axis].drivers.find(d => d.key === key);

describe('evaluateCondition の基本', () => {
    it('全軸のスコアとバージョンを返す', () => {
        const result = run(baseDay());
        expect(result.date).toBe(DATE);
        expect(result.version).toBe(ENGINE_VERSION);
        for (const axis of AXES) {
            expect(result.axes[axis].score).toBeTypeOf('number');
            expect(result.axes[axis].grade).toBeTruthy();
        }
    });

    it('食事が無い日は全軸 insufficient でスコアを出さない', () => {
        const result = run([]);
        for (const axis of AXES) {
            expect(result.axes[axis].score).toBeNull();
            expect(result.axes[axis].grade).toBeNull();
            expect(result.axes[axis].confidence).toBe('insufficient');
            expect(result.axes[axis].drivers).toEqual([]);
        }
        expect(hasAnyScore(result)).toBe(false);
    });

    it('別の論理日の食事は集計に入れない', () => {
        const result = run([
            ...baseDay(),
            meal({ timestamp: at('12:00', '2026-07-28').toISOString() }),
        ]);
        expect(result.mealCount).toBe(3);
    });

    it('深夜1時の食事は前日の論理日に含める', () => {
        const result = run([
            ...baseDay(),
            meal({ foodName: '夜食', timestamp: at('01:00', '2026-07-30').toISOString() }),
        ]);
        expect(result.mealCount).toBe(4);
    });

    it('スコアは 0〜100 にクランプされる', () => {
        // 悪い要素を大量に盛る
        const result = run([
            meal({
                mealType: 'dinner', timestamp: at('00:30', '2026-07-30').toISOString(), calories: 1500,
                macros: { fat: 60, carbs: 200, sugar: 190, fiber: 1, alcohol: 60, caffeine: 200, ultraProcessed: 3 },
            }),
            meal({ mealType: 'snack', timestamp: at('23:00').toISOString(), macros: { caffeine: 100, sugar: 90, fiber: 0 } }),
        ]);
        for (const axis of AXES) {
            const score = result.axes[axis].score;
            if (score !== null) {
                expect(score).toBeGreaterThanOrEqual(0);
                expect(score).toBeLessThanOrEqual(100);
            }
        }
    });

    it('ドライバーが1つも発火しなければ基準点になる', () => {
        // 全ドライバーが黙る最小構成（栄養素は記録済みだが閾値には届かない）
        const meals = [
            meal({ mealType: 'breakfast', timestamp: at('08:00').toISOString(), calories: 700, macros: { protein: 10 } }),
            meal({ mealType: 'lunch', timestamp: at('12:30').toISOString(), calories: 700, macros: { protein: 10 } }),
        ];
        const result = evaluateCondition({ dateKey: DATE, meals, profile: PROFILE, now: at('14:00') });
        expect(result.axes.mood.drivers).toEqual([]);
        expect(result.axes.mood.score).toBe(BASE_SCORE);
    });

    it('ドライバーは影響の大きい順に並ぶ', () => {
        const result = run(baseDay());
        for (const axis of AXES) {
            const deltas = result.axes[axis].drivers.map(d => Math.abs(d.delta));
            expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
        }
    });
});

describe('focus のドライバー', () => {
    it('朝食のタンパク質が20g以上で加点', () => {
        const result = run([
            meal({ mealType: 'breakfast', timestamp: at('08:00').toISOString(), macros: { protein: 25 } }),
            ...baseDay().slice(1),
        ]);
        expect(driver(result, 'focus', 'breakfast_protein').delta).toBe(DRIVER_WEIGHTS.focus.breakfast_protein);
    });

    it('朝食のタンパク質が閾値未満なら発火しない', () => {
        const result = run([
            meal({ mealType: 'breakfast', timestamp: at('08:00').toISOString(), macros: { protein: 19 } }),
            ...baseDay().slice(1),
        ]);
        expect(driverKeys(result, 'focus')).not.toContain('breakfast_protein');
    });

    it('朝の時点では欠食と決めつけない', () => {
        const result = evaluateCondition({
            dateKey: DATE,
            meals: [meal({ mealType: 'lunch', timestamp: at('10:00').toISOString() })],
            profile: PROFILE,
            now: at('10:30'),
        });
        expect(driverKeys(result, 'focus')).not.toContain('breakfast_skipped');
    });

    it('11時を過ぎて午前の記録が無ければ欠食で減点', () => {
        const result = run([meal({ mealType: 'lunch', timestamp: at('13:00').toISOString() })]);
        expect(driver(result, 'focus', 'breakfast_skipped').delta).toBe(DRIVER_WEIGHTS.focus.breakfast_skipped);
    });

    it('朝食タイプでなくても午前中に食べていれば欠食にしない', () => {
        const result = run([meal({ mealType: 'snack', timestamp: at('09:00').toISOString() })]);
        expect(driverKeys(result, 'focus')).not.toContain('breakfast_skipped');
    });

    it('昼の高GL・低タンパク・低繊維で大きく減点', () => {
        const result = run([
            baseDay()[0],
            meal({ mealType: 'lunch', timestamp: at('12:30').toISOString(), macros: { glycemicLoad: 35, protein: 8, fiber: 2 } }),
            baseDay()[2],
        ]);
        expect(driver(result, 'focus', 'lunch_carb_bomb').delta).toBe(DRIVER_WEIGHTS.focus.lunch_carb_bomb);
    });

    it('高GLでもタンパク質が十分なら発火しない', () => {
        const result = run([
            baseDay()[0],
            meal({ mealType: 'lunch', timestamp: at('12:30').toISOString(), macros: { glycemicLoad: 35, protein: 30, fiber: 2 } }),
            baseDay()[2],
        ]);
        expect(driverKeys(result, 'focus')).not.toContain('lunch_carb_bomb');
    });

    it('GLが未記録なら推測で減点しない', () => {
        const result = run([
            baseDay()[0],
            meal({ mealType: 'lunch', timestamp: at('12:30').toISOString(), macros: { glycemicLoad: null, protein: 8, fiber: 2 } }),
            baseDay()[2],
        ]);
        expect(driverKeys(result, 'focus')).not.toContain('lunch_carb_bomb');
    });

    it('昼食が1日目標の45%を超えたら減点', () => {
        const result = run([
            baseDay()[0],
            meal({ mealType: 'lunch', timestamp: at('12:30').toISOString(), calories: 1100 }),
            baseDay()[2],
        ]);
        expect(driverKeys(result, 'focus')).toContain('lunch_heavy');
    });

    it('午前のカフェインは加点、午後以降のカフェインは睡眠を減点', () => {
        const meals = [
            ...baseDay(),
            meal({ foodName: 'コーヒー', mealType: 'snack', calories: 5, timestamp: at('09:00').toISOString(), macros: { caffeine: 90 } }),
        ];
        const result = run(meals);
        expect(driverKeys(result, 'focus')).toContain('caffeine_morning');
        expect(driverKeys(result, 'sleep')).not.toContain('caffeine_late');
    });

    it('1日400mgを超えるカフェインは減点', () => {
        const result = run([
            ...baseDay(),
            meal({ mealType: 'snack', calories: 5, timestamp: at('09:00').toISOString(), macros: { caffeine: 450 } }),
        ]);
        expect(driverKeys(result, 'focus')).toContain('caffeine_excess');
    });

    it('鉄不足は日が終わってから初めて減点する', () => {
        const lowIron = baseDay().map(m => ({ ...m, macros: { ...m.macros, iron: 1 } }));

        const midday = evaluateCondition({
            dateKey: DATE,
            meals: lowIron.slice(0, 2),
            profile: PROFILE,
            now: at('13:00'),
        });
        expect(driverKeys(midday, 'focus')).not.toContain('iron_low');

        const evening = run(lowIron);
        expect(driverKeys(evening, 'focus')).toContain('iron_low');
    });
});

describe('sleep のドライバー', () => {
    it('就寝3時間以内の食事で減点', () => {
        // 就寝 1:00 に対し 23:00 は 2時間前
        const result = run([...baseDay(), meal({ mealType: 'snack', timestamp: at('23:00').toISOString() })]);
        expect(driver(result, 'sleep', 'late_meal').delta).toBe(DRIVER_WEIGHTS.sleep.late_meal);
    });

    it('就寝4時間前の食事は遅いと見なさない', () => {
        const result = run(baseDay()); // 夕食 19:00 = 就寝6時間前
        expect(driverKeys(result, 'sleep')).not.toContain('late_meal');
    });

    it('就寝直前かつ脂質25g超なら追加で減点', () => {
        const result = run([
            ...baseDay(),
            meal({ mealType: 'snack', timestamp: at('23:30').toISOString(), macros: { fat: 40 } }),
        ]);
        expect(driverKeys(result, 'sleep')).toContain('late_meal');
        expect(driverKeys(result, 'sleep')).toContain('late_meal_fatty');
    });

    it('就寝時刻が未設定なら遅い食事の判定をしない（推測で減点しない）', () => {
        const result = run(
            [...baseDay(), meal({ mealType: 'snack', timestamp: at('23:00').toISOString() })],
            { profile: { ...PROFILE, bedtime: '' } }
        );
        expect(driverKeys(result, 'sleep')).not.toContain('late_meal');
    });

    it('深夜0:30の夜食も就寝1:00の直前として正しく減点する', () => {
        const result = run([
            ...baseDay(),
            meal({ mealType: 'snack', timestamp: at('00:30', '2026-07-30').toISOString() }),
        ]);
        expect(driverKeys(result, 'sleep')).toContain('late_meal');
    });

    it('アルコール20g以上で減点、40g以上ではさらに大きく減点', () => {
        const moderate = run([...baseDay(), meal({ mealType: 'snack', macros: { alcohol: 20 }, timestamp: at('19:30').toISOString() })]);
        expect(driverKeys(moderate, 'sleep')).toContain('alcohol_moderate');
        expect(driverKeys(moderate, 'sleep')).not.toContain('alcohol_heavy');

        const heavy = run([...baseDay(), meal({ mealType: 'snack', macros: { alcohol: 45 }, timestamp: at('19:30').toISOString() })]);
        expect(driverKeys(heavy, 'sleep')).toContain('alcohol_heavy');
        expect(driverKeys(heavy, 'sleep')).not.toContain('alcohol_moderate');
    });

    it('午後のカフェインは杯数に応じて減点し、下限で頭打ちになる', () => {
        const coffee = (hhmm) => meal({
            foodName: 'コーヒー', mealType: 'snack', calories: 5,
            timestamp: at(hhmm).toISOString(), macros: { caffeine: 90 },
        });

        const one = run([...baseDay(), coffee('15:00')]);
        expect(driver(one, 'sleep', 'caffeine_late').delta).toBe(DRIVER_WEIGHTS.sleep.caffeine_late);

        const many = run([...baseDay(), coffee('15:00'), coffee('17:00'), coffee('19:00'), coffee('21:00')]);
        expect(driver(many, 'sleep', 'caffeine_late').delta).toBe(-25); // CAPS.caffeineLate
    });

    it('深夜1時のカフェインも「午後以降」として扱う', () => {
        const result = run([
            ...baseDay(),
            meal({ foodName: 'コーヒー', mealType: 'snack', calories: 5, timestamp: at('01:00', '2026-07-30').toISOString(), macros: { caffeine: 90 } }),
        ]);
        expect(driverKeys(result, 'sleep')).toContain('caffeine_late');
    });

    it('早めで軽い夕食は加点', () => {
        const result = run([
            baseDay()[0], baseDay()[1],
            meal({ mealType: 'dinner', timestamp: at('19:00').toISOString(), calories: 500 }),
        ]);
        expect(driverKeys(result, 'sleep')).toContain('dinner_light_early');
    });

    it('夕食の炭水化物が120g超なら減点', () => {
        const result = run([
            baseDay()[0], baseDay()[1],
            meal({ mealType: 'dinner', timestamp: at('19:00').toISOString(), macros: { carbs: 150 } }),
        ]);
        expect(driverKeys(result, 'sleep')).toContain('dinner_carb_excess');
    });

    it('夕食のトリプトファンと適度な炭水化物の組み合わせで加点', () => {
        const result = run([
            baseDay()[0], baseDay()[1],
            meal({ mealType: 'dinner', timestamp: at('19:00').toISOString(), macros: { tryptophan: 300, carbs: 45 } }),
        ]);
        expect(driverKeys(result, 'sleep')).toContain('tryptophan_carb_combo');
    });
});

describe('energy のドライバー', () => {
    it('食事間隔が6時間を超えたら減点', () => {
        const result = run([
            meal({ mealType: 'breakfast', timestamp: at('07:00').toISOString() }),
            meal({ mealType: 'dinner', timestamp: at('19:00').toISOString() }),
        ]);
        expect(driverKeys(result, 'energy')).toContain('meal_gap_long');
    });

    it('食事が1つだけなら間隔を判定しない', () => {
        const result = run([meal({ mealType: 'dinner', timestamp: at('19:00').toISOString() })]);
        expect(driverKeys(result, 'energy')).not.toContain('meal_gap_long');
    });

    it('食物繊維20g以上で加点（energy と mood の両方）', () => {
        const result = run(baseDay().map(m => ({ ...m, macros: { ...m.macros, fiber: 8 } })));
        expect(driverKeys(result, 'energy')).toContain('fiber_sufficient');
        expect(driverKeys(result, 'mood')).toContain('fiber_sufficient');
    });

    it('糖質に対して繊維が少ない食事は食数ぶん減点し、下限で頭打ちになる', () => {
        const bad = (hhmm) => meal({ mealType: 'snack', timestamp: at(hhmm).toISOString(), macros: { sugar: 60, fiber: 1 } });
        const result = run([...baseDay(), bad('10:00'), bad('15:00'), bad('16:00')]);
        expect(driver(result, 'energy', 'sugar_fiber_ratio_bad').delta).toBe(-20); // CAPS.sugarFiber
    });

    it('繊維ゼロでも 0除算にならず判定できる', () => {
        const result = run([...baseDay(), meal({ mealType: 'snack', timestamp: at('15:00').toISOString(), macros: { sugar: 30, fiber: 0 } })]);
        expect(driverKeys(result, 'energy')).toContain('sugar_fiber_ratio_bad');
    });

    it('体重×1.2g のタンパク質で加点', () => {
        const result = run(baseDay().map(m => ({ ...m, macros: { ...m.macros, protein: 30 } })));
        expect(driverKeys(result, 'energy')).toContain('protein_sufficient');
    });

    it('体重未登録ならフォールバック値で判定する', () => {
        const result = run(
            baseDay().map(m => ({ ...m, macros: { ...m.macros, protein: 25 } })),
            { profile: { bedtime: '01:00', targetCalories: 2200 } }
        );
        expect(driverKeys(result, 'energy')).toContain('protein_sufficient');
    });

    it('カロリー不足は日が終わってから初めて減点する', () => {
        const tiny = [meal({ mealType: 'breakfast', timestamp: at('08:00').toISOString(), calories: 200 })];

        const midday = evaluateCondition({ dateKey: DATE, meals: tiny, profile: PROFILE, now: at('12:00') });
        expect(driverKeys(midday, 'energy')).not.toContain('calorie_deficit_severe');

        const night = evaluateCondition({ dateKey: DATE, meals: tiny, profile: PROFILE, now: at('22:00') });
        expect(driverKeys(night, 'energy')).toContain('calorie_deficit_severe');
    });

    it('目標カロリー未設定なら不足判定をしない', () => {
        const result = run([meal({ calories: 100 })], { profile: { bedtime: '01:00' } });
        expect(driverKeys(result, 'energy')).not.toContain('calorie_deficit_severe');
    });

    it('超加工度の平均が2.0以上で減点', () => {
        const result = run(baseDay().map(m => ({ ...m, macros: { ...m.macros, ultraProcessed: 3 } })));
        expect(driverKeys(result, 'energy')).toContain('ultra_processed_high');
        expect(driverKeys(result, 'mood')).toContain('ultra_processed_high');
    });
});

describe('mood のドライバー', () => {
    it('発酵食品を食品名から拾って加点', () => {
        const result = run([...baseDay(), meal({ foodName: '納豆ごはん', mealType: 'snack', timestamp: at('09:00').toISOString() })]);
        const hit = driver(result, 'mood', 'fermented_food');
        expect(hit.delta).toBe(DRIVER_WEIGHTS.mood.fermented_food);
        expect(hit.detail).toBe('納豆ごはん');
    });

    it('オメガ3とビタミンDが十分なら加点', () => {
        const result = run(baseDay().map(m => ({ ...m, macros: { ...m.macros, omega3: 400, vitaminD: 5 } })));
        expect(driverKeys(result, 'mood')).toContain('omega3_sufficient');
        expect(driverKeys(result, 'mood')).toContain('vitaminD_sufficient');
    });
});

describe('confidence', () => {
    it('栄養素が全く記録されていなければ insufficient', () => {
        const bare = [
            { foodName: 'なにか', calories: 500, mealType: 'lunch', timestamp: at('12:00').toISOString(), macros: { protein: 20, fat: 10, carbs: 60 } },
        ];
        const result = run(bare);
        for (const axis of AXES) {
            expect(result.axes[axis].confidence).toBe('insufficient');
        }
    });

    it('記録が揃っていれば high になる', () => {
        const result = run(baseDay());
        expect(result.axes.focus.confidence).toBe('high');
    });

    it('食事が1件だけなら high にはならない', () => {
        const result = run([meal()]);
        expect(['low', 'medium', 'insufficient']).toContain(result.axes.focus.confidence);
    });

    it('就寝時刻が不明なら sleep の confidence を low に抑える', () => {
        const withBedtime = run(baseDay());
        const withoutBedtime = run(baseDay(), { profile: { ...PROFILE, bedtime: null } });

        expect(withBedtime.axes.sleep.confidence).not.toBe('low');
        expect(withoutBedtime.axes.sleep.confidence).toBe('low');
    });
});

describe('topPositive / topNegative', () => {
    it('全軸を通じて最も効いた要因を返す', () => {
        const result = run([
            baseDay()[0],
            meal({ mealType: 'lunch', timestamp: at('12:30').toISOString(), macros: { glycemicLoad: 40, protein: 5, fiber: 1 } }),
            baseDay()[2],
        ]);
        expect(result.topNegative.key).toBe('lunch_carb_bomb');
        expect(result.topNegative.axis).toBe('focus');
    });

    it('要因が無ければ null', () => {
        const result = run([]);
        expect(result.topPositive).toBeNull();
        expect(result.topNegative).toBeNull();
    });
});

describe('保存用ヘルパー', () => {
    it('toPredictedScores はスコアだけを取り出す', () => {
        const result = run(baseDay());
        const predicted = toPredictedScores(result);
        expect(Object.keys(predicted).sort()).toEqual([...AXES].sort());
        expect(predicted.focus).toBe(result.axes.focus.score);
    });

    it('toPredictedScores は insufficient を null にする', () => {
        expect(toPredictedScores(run([]))).toEqual({ focus: null, sleep: null, energy: null, mood: null });
    });

    it('hasAnyScore は1軸でもスコアがあれば true', () => {
        expect(hasAnyScore(run(baseDay()))).toBe(true);
        expect(hasAnyScore(run([]))).toBe(false);
        expect(hasAnyScore(null)).toBe(false);
    });
});

describe('異常な入力への耐性', () => {
    it('macros が無い食事でも落ちない', () => {
        expect(() => run([{ foodName: 'x', calories: 100, mealType: 'lunch', timestamp: at('12:00').toISOString() }])).not.toThrow();
    });

    it('timestamp が壊れた食事は無視する', () => {
        const result = run([...baseDay(), { foodName: 'x', calories: 100, timestamp: 'invalid' }]);
        expect(result.mealCount).toBe(3);
    });

    it('profile が空でも落ちない', () => {
        expect(() => evaluateCondition({ dateKey: DATE, meals: baseDay(), profile: {}, now: at('22:00') })).not.toThrow();
    });

    it('引数なしでも落ちない', () => {
        expect(() => evaluateCondition({ dateKey: DATE })).not.toThrow();
    });
});

describe('個人係数（Phase 4 のパーソナライズ）', () => {
    const coffeeDay = () => [
        ...baseDay(),
        meal({ foodName: 'コーヒー', mealType: 'snack', calories: 5, timestamp: at('15:00').toISOString(), macros: { caffeine: 90 } }),
    ];

    it('係数が無ければ一般論の重みのまま', () => {
        const result = run(coffeeDay());
        expect(driver(result, 'sleep', 'caffeine_late').delta).toBe(DRIVER_WEIGHTS.sleep.caffeine_late);
    });

    it('係数が大きければ影響も大きくなる', () => {
        const result = evaluateCondition({
            dateKey: DATE, meals: coffeeDay(), profile: PROFILE, now: at('22:00'),
            driverWeights: { sleep: { caffeine_late: 1.5 } },
        });
        expect(driver(result, 'sleep', 'caffeine_late').delta).toBe(Math.round(DRIVER_WEIGHTS.sleep.caffeine_late * 1.5));
        expect(driver(result, 'sleep', 'caffeine_late').personalized).toBe(true);
    });

    it('係数が小さければ影響も小さくなる', () => {
        const result = evaluateCondition({
            dateKey: DATE, meals: coffeeDay(), profile: PROFILE, now: at('22:00'),
            driverWeights: { sleep: { caffeine_late: 0.5 } },
        });
        const delta = driver(result, 'sleep', 'caffeine_late').delta;
        expect(Math.abs(delta)).toBeLessThan(Math.abs(DRIVER_WEIGHTS.sleep.caffeine_late));
    });

    it('係数を適用した結果スコアも変わる', () => {
        const weak = evaluateCondition({
            dateKey: DATE, meals: coffeeDay(), profile: PROFILE, now: at('22:00'),
            driverWeights: { sleep: { caffeine_late: 0.5 } },
        });
        const strong = evaluateCondition({
            dateKey: DATE, meals: coffeeDay(), profile: PROFILE, now: at('22:00'),
            driverWeights: { sleep: { caffeine_late: 1.5 } },
        });
        expect(weak.axes.sleep.score).toBeGreaterThan(strong.axes.sleep.score);
    });

    it('指定されていないドライバーは影響を受けない', () => {
        const result = evaluateCondition({
            dateKey: DATE, meals: coffeeDay(), profile: PROFILE, now: at('22:00'),
            driverWeights: { sleep: { caffeine_late: 1.5 } },
        });
        const other = driver(result, 'focus', 'breakfast_protein');
        expect(other.delta).toBe(DRIVER_WEIGHTS.focus.breakfast_protein);
        expect(other.personalized).toBe(false);
    });

    it('他の軸の係数は混ざらない', () => {
        const result = evaluateCondition({
            dateKey: DATE, meals: coffeeDay(), profile: PROFILE, now: at('22:00'),
            driverWeights: { focus: { caffeine_late: 1.5 } },
        });
        expect(driver(result, 'sleep', 'caffeine_late').delta).toBe(DRIVER_WEIGHTS.sleep.caffeine_late);
    });
});

describe('toFiredDrivers（相関分析の材料）', () => {
    it('軸ごとに発火したキーを返す', () => {
        const result = run([
            ...baseDay(),
            meal({ foodName: 'コーヒー', mealType: 'snack', calories: 5, timestamp: at('15:00').toISOString(), macros: { caffeine: 90 } }),
        ]);
        const fired = toFiredDrivers(result);
        expect(fired.sleep).toContain('caffeine_late');
        expect(Object.keys(fired).sort()).toEqual([...AXES].sort());
    });

    it('発火が無ければ空配列（キー自体は必ず存在する）', () => {
        const fired = toFiredDrivers(run([]));
        for (const axis of AXES) expect(fired[axis]).toEqual([]);
    });

    it('null でも落ちない', () => {
        expect(() => toFiredDrivers(null)).not.toThrow();
    });
});
