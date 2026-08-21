/**
 * Tests for src/lib/health/trainerContext.js
 */
import { describe, it, expect } from 'vitest';
import { buildTrainerContextText, formatJstTime, formatHours } from '@/lib/health/trainerContext';

describe('formatJstTime', () => {
    it('formats ISO string to JST HH:MM', () => {
        // UTC 14:30 = JST 23:30
        expect(formatJstTime('2026-08-20T14:30:00.000Z')).toBe('23:30');
    });

    it('returns null for invalid input', () => {
        expect(formatJstTime(null)).toBeNull();
        expect(formatJstTime('not-a-date')).toBeNull();
    });
});

describe('formatHours', () => {
    it('converts minutes to X.X時間', () => {
        expect(formatHours(390)).toBe('6.5時間');
        expect(formatHours(360)).toBe('6時間');
    });

    it('returns null for invalid or non-positive values', () => {
        expect(formatHours(null)).toBeNull();
        expect(formatHours(0)).toBeNull();
        expect(formatHours('abc')).toBeNull();
    });
});

describe('buildTrainerContextText', () => {
    const sleepLog = {
        sleep: {
            subjective: 2,
            objective: {
                sleepStart: '2026-08-20T15:50:00.000Z', // JST 00:50
                sleepEnd: '2026-08-20T21:30:00.000Z',   // JST 06:30
                asleepMinutes: 320,
                inBedMinutes: 340,
            },
        },
    };
    const todayLog = { focus: { subjective: 2 }, energy: { subjective: 4 } };

    it('returns null when there is no data at all', () => {
        expect(buildTrainerContextText({})).toBeNull();
        expect(buildTrainerContextText()).toBeNull();
        expect(buildTrainerContextText({ sleepLog: {}, todayLog: {}, findings: [] })).toBeNull();
    });

    it('includes objective sleep with duration and JST times', () => {
        const text = buildTrainerContextText({ sleepLog });
        expect(text).toContain('昨夜の睡眠（実測）: 5.3時間');
        expect(text).toContain('00:50就寝');
        expect(text).toContain('06:30起床');
    });

    it('falls back to inBedMinutes when asleepMinutes is missing', () => {
        const log = { sleep: { objective: { inBedMinutes: 420 } } };
        const text = buildTrainerContextText({ sleepLog: log });
        expect(text).toContain('7時間（ベッドにいた時間）');
    });

    it('includes subjective scores with labels', () => {
        const text = buildTrainerContextText({ sleepLog, todayLog });
        expect(text).toContain('昨夜の眠りの体感: 2/5（いまいち）');
        expect(text).toContain('今日の集中力の体感: 2/5（いまいち）');
        expect(text).toContain('今日のエネルギーの体感: 4/5（よい）');
        // mood は未回答なので行ごと出さない
        expect(text).not.toContain('気分');
    });

    it('ignores out-of-range subjective values', () => {
        const text = buildTrainerContextText({ todayLog: { focus: { subjective: 9 } } });
        expect(text).toBeNull();
    });

    it('includes bedtime only when valid HH:MM', () => {
        const text = buildTrainerContextText({ todayLog, bedtime: '01:00' });
        expect(text).toContain('就寝予定時刻: 01:00');

        const invalid = buildTrainerContextText({ todayLog, bedtime: 'morning' });
        expect(invalid).not.toContain('就寝予定時刻');
    });

    it('includes activity steps and active energy', () => {
        const text = buildTrainerContextText({ todayLog, activity: { steps: 8234, activeEnergy: 312.4 } });
        expect(text).toContain('今日の歩数: 8,234歩');
        expect(text).toContain('活動消費 約312kcal');
    });

    it('includes findings block with disclaimer note', () => {
        const text = buildTrainerContextText({ findings: ['昼の血糖負荷が高い日は集中力の体感が低い傾向'] });
        expect(text).toContain('この人に特有の傾向');
        expect(text).toContain('- 昼の血糖負荷が高い日は集中力の体感が低い傾向');
        expect(text).toContain('断定はしない');
    });

    it('does not fire on bedtime alone (needs actual measurements or findings)', () => {
        // 実測もfindingsも無いのに就寝予定時刻だけでブロックを出すのは正しい
        // （食事タイミング助言に使えるため、行が1つでもあれば出す設計）
        const text = buildTrainerContextText({ bedtime: '01:00' });
        expect(text).toContain('就寝予定時刻: 01:00');
    });
});
