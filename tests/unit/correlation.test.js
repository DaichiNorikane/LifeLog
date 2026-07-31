/**
 * Tests for src/lib/health/correlation.js
 *
 * この機能は「統計に対する誠実さ」が仕様そのもの。
 * サンプル不足で知見を出さないこと・係数が暴走しないことを最優先で検証する。
 */
import { describe, it, expect } from 'vitest';
import {
    analyzeDriverCorrelations,
    describeFinding,
    toDisplayableFindings,
    countAnalyzableDays,
    MIN_SAMPLE_DAYS,
    COEFFICIENT_RANGE,
} from '@/lib/health/correlation';
import { DRIVER_WEIGHTS } from '@/lib/health/conditionRules';

/** 睡眠の主観スコアと発火ドライバーを持つ1日分のログ */
const day = (sleepScore, sleepDrivers = [], extra = {}) => ({
    date: '2026-07-01',
    sleep: { subjective: sleepScore },
    firedDrivers: { focus: [], sleep: sleepDrivers, energy: [], mood: [] },
    ...extra,
});

/** カフェインありN日（主観low）／なしN日（主観high）を作る */
const buildLogs = ({ firedDays, notFiredDays, firedScore = 2, notFiredScore = 4 }) => [
    ...Array.from({ length: firedDays }, () => day(firedScore, ['caffeine_late'])),
    ...Array.from({ length: notFiredDays }, () => day(notFiredScore, [])),
];

describe('サンプル数のガード', () => {
    it(`両群が${MIN_SAMPLE_DAYS}日ずつ揃えば知見を出す`, () => {
        const model = analyzeDriverCorrelations(buildLogs({ firedDays: 7, notFiredDays: 7 }));
        expect(model.findings).toHaveLength(1);
        expect(model.findings[0].driver).toBe('caffeine_late');
    });

    it('発火群が足りなければ知見を出さない', () => {
        const model = analyzeDriverCorrelations(buildLogs({ firedDays: 6, notFiredDays: 20 }));
        expect(model.findings).toEqual([]);
        expect(model.driverWeights).toEqual({});
    });

    it('非発火群が足りなければ知見を出さない（毎日やっている習慣は比較できない）', () => {
        const model = analyzeDriverCorrelations(buildLogs({ firedDays: 20, notFiredDays: 6 }));
        expect(model.findings).toEqual([]);
    });

    it('主観の回答が無い日は分析に使わない', () => {
        const logs = [
            ...Array.from({ length: 10 }, () => ({ firedDrivers: { sleep: ['caffeine_late'] }, sleep: {} })),
            ...Array.from({ length: 10 }, () => ({ firedDrivers: { sleep: [] }, sleep: {} })),
        ];
        expect(analyzeDriverCorrelations(logs).findings).toEqual([]);
    });

    it('firedDrivers が無い古いログは無視する', () => {
        const logs = [...buildLogs({ firedDays: 7, notFiredDays: 7 }), { sleep: { subjective: 3 } }];
        const model = analyzeDriverCorrelations(logs);
        expect(model.sampleDays).toBe(14);
    });

    it('空配列でも落ちない', () => {
        const model = analyzeDriverCorrelations([]);
        expect(model).toMatchObject({ sampleDays: 0, driverWeights: {}, findings: [] });
    });

    it('引数なしでも落ちない', () => {
        expect(() => analyzeDriverCorrelations()).not.toThrow();
    });
});

describe('個人係数', () => {
    it('一般論どおりの効き方なら係数は 1 付近', () => {
        // caffeine_late の重みは -12 → 主観では -0.6 の想定
        const logs = buildLogs({ firedDays: 8, notFiredDays: 8, firedScore: 3.4, notFiredScore: 4 });
        const model = analyzeDriverCorrelations(logs);
        expect(model.driverWeights.sleep.caffeine_late).toBeCloseTo(1, 1);
    });

    it('想定より強く効いていれば係数が上がる', () => {
        const logs = buildLogs({ firedDays: 8, notFiredDays: 8, firedScore: 2, notFiredScore: 5 });
        expect(analyzeDriverCorrelations(logs).driverWeights.sleep.caffeine_late).toBeGreaterThan(1);
    });

    it('想定より弱ければ係数が下がる', () => {
        const logs = buildLogs({ firedDays: 8, notFiredDays: 8, firedScore: 3.8, notFiredScore: 4 });
        expect(analyzeDriverCorrelations(logs).driverWeights.sleep.caffeine_late).toBeLessThan(1);
    });

    it('効果が極端でも上限を超えない', () => {
        const logs = buildLogs({ firedDays: 8, notFiredDays: 8, firedScore: 1, notFiredScore: 5 });
        expect(analyzeDriverCorrelations(logs).driverWeights.sleep.caffeine_late)
            .toBeLessThanOrEqual(COEFFICIENT_RANGE.max);
    });

    it('想定と逆方向でも符号は反転させず、下限まで弱めるだけ', () => {
        // カフェインを飲んだ日の方が「よく眠れた」と答えているケース
        const logs = buildLogs({ firedDays: 8, notFiredDays: 8, firedScore: 5, notFiredScore: 2 });
        const coefficient = analyzeDriverCorrelations(logs).driverWeights.sleep.caffeine_late;
        expect(coefficient).toBe(COEFFICIENT_RANGE.min);
        expect(coefficient).toBeGreaterThan(0);
    });

    it('係数は常に下限以上・上限以下', () => {
        for (const [firedScore, notFiredScore] of [[1, 5], [5, 1], [3, 3], [2.9, 3.1]]) {
            const logs = buildLogs({ firedDays: 8, notFiredDays: 8, firedScore, notFiredScore });
            const c = analyzeDriverCorrelations(logs).driverWeights.sleep?.caffeine_late;
            if (c === undefined) continue;
            expect(c).toBeGreaterThanOrEqual(COEFFICIENT_RANGE.min);
            expect(c).toBeLessThanOrEqual(COEFFICIENT_RANGE.max);
        }
    });

    it('重みが定義されていないドライバーでも落ちない', () => {
        const logs = [
            ...Array.from({ length: 8 }, () => day(2, ['unknown_driver'])),
            ...Array.from({ length: 8 }, () => day(4, [])),
        ];
        expect(() => analyzeDriverCorrelations(logs)).not.toThrow();
        expect(DRIVER_WEIGHTS.sleep.unknown_driver).toBeUndefined();
    });
});

describe('複数ドライバー・複数軸', () => {
    it('軸ごとに独立して分析する', () => {
        const logs = [
            ...Array.from({ length: 8 }, () => ({
                sleep: { subjective: 2 }, focus: { subjective: 2 },
                firedDrivers: { sleep: ['caffeine_late'], focus: ['breakfast_skipped'], energy: [], mood: [] },
            })),
            ...Array.from({ length: 8 }, () => ({
                sleep: { subjective: 4 }, focus: { subjective: 4 },
                firedDrivers: { sleep: [], focus: [], energy: [], mood: [] },
            })),
        ];
        const model = analyzeDriverCorrelations(logs);
        expect(model.driverWeights.sleep.caffeine_late).toBeDefined();
        expect(model.driverWeights.focus.breakfast_skipped).toBeDefined();
    });

    it('一般論とのズレが大きい順に並ぶ', () => {
        const logs = [
            ...Array.from({ length: 8 }, () => day(1, ['caffeine_late', 'dinner_carb_excess'])),
            ...Array.from({ length: 8 }, () => day(5, [])),
        ];
        const model = analyzeDriverCorrelations(logs);
        const gaps = model.findings.map(f => Math.abs(f.observedDelta - f.expectedDelta));
        expect(gaps).toEqual([...gaps].sort((a, b) => b - a));
    });
});

describe('describeFinding（断定しない文章）', () => {
    const model = () => analyzeDriverCorrelations(buildLogs({ firedDays: 9, notFiredDays: 9 }));

    it('日数を必ず添える', () => {
        const text = describeFinding(model().findings[0]);
        expect(text).toContain('9日分');
    });

    it('平均の差として述べる', () => {
        const text = describeFinding(model().findings[0]);
        expect(text).toContain('平均');
        expect(text).toContain('下がって');
    });

    it('差がほとんど無い場合はそう述べる（見つからないのも結果）', () => {
        const logs = buildLogs({ firedDays: 8, notFiredDays: 8, firedScore: 3, notFiredScore: 3.05 });
        const text = describeFinding(analyzeDriverCorrelations(logs).findings[0]);
        expect(text).toContain('ほとんど変わっていません');
    });

    it('サンプル不足の観察は文章にしない', () => {
        expect(describeFinding({ enoughData: false })).toBeNull();
        expect(describeFinding(null)).toBeNull();
    });
});

describe('toDisplayableFindings', () => {
    it('上位N件だけを文字列にする', () => {
        const logs = [
            ...Array.from({ length: 8 }, () => day(1, ['caffeine_late', 'dinner_carb_excess', 'late_meal'])),
            ...Array.from({ length: 8 }, () => day(5, [])),
        ];
        expect(toDisplayableFindings(analyzeDriverCorrelations(logs), 2)).toHaveLength(2);
    });

    it('知見が無ければ空配列', () => {
        expect(toDisplayableFindings(null)).toEqual([]);
        expect(toDisplayableFindings({ findings: [] })).toEqual([]);
    });
});

describe('countAnalyzableDays', () => {
    it('主観の回答がある日だけを数える', () => {
        const logs = [
            day(3, ['caffeine_late']),
            day(4, []),
            { firedDrivers: { sleep: [] }, sleep: {} },  // 未回答
        ];
        expect(countAnalyzableDays(logs)).toBe(2);
    });

    it('空でも 0', () => {
        expect(countAnalyzableDays([])).toBe(0);
        expect(countAnalyzableDays()).toBe(0);
    });
});
