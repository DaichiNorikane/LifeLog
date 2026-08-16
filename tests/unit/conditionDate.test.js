/**
 * Tests for src/lib/health/conditionDate.js
 *
 * 就寝が 0:00〜2:00 のユーザーを前提に、深夜の食事と睡眠の帰属が
 * 「原因の日」に揃うことを保証する。ここがずれると相関分析が全て壊れる。
 */
import { describe, it, expect } from 'vitest';
import {
    DAY_BOUNDARY_HOUR,
    getJstParts,
    getCalendarDateKey,
    getLogicalDateKey,
    shiftDateKey,
    getSleepTargetDateKey,
    resolveBedtime,
    hoursUntilBedtime,
    DEFAULT_SLEEP_SCHEDULE,
} from '@/lib/health/conditionDate';

/** JST の壁時計時刻から Date を作る */
const jst = (iso) => new Date(`${iso}+09:00`);

describe('getJstParts', () => {
    it('UTC の Date を JST に変換する', () => {
        const parts = getJstParts(new Date('2026-07-29T15:00:00Z'));
        expect(parts).toMatchObject({ year: 2026, month: 7, day: 30, hour: 0 });
    });
});

describe('getCalendarDateKey', () => {
    it('JST のカレンダー日を返す', () => {
        expect(getCalendarDateKey(jst('2026-07-29T23:59:00'))).toBe('2026-07-29');
        expect(getCalendarDateKey(jst('2026-07-30T00:01:00'))).toBe('2026-07-30');
    });

    it('月末をまたいでも正しい', () => {
        expect(getCalendarDateKey(jst('2026-07-31T23:00:00'))).toBe('2026-07-31');
        expect(getCalendarDateKey(jst('2026-08-01T00:30:00'))).toBe('2026-08-01');
    });
});

describe('getLogicalDateKey', () => {
    it('境界時刻は 4:00', () => {
        expect(DAY_BOUNDARY_HOUR).toBe(4);
    });

    it('深夜 0:00〜3:59 は前日として扱う', () => {
        // 就寝 0:00〜2:00 のユーザーが 1:00 に食べた夜食は「前日の夜食」
        expect(getLogicalDateKey(jst('2026-07-30T01:00:00'))).toBe('2026-07-29');
        expect(getLogicalDateKey(jst('2026-07-30T03:59:00'))).toBe('2026-07-29');
    });

    it('4:00 以降はその日として扱う', () => {
        expect(getLogicalDateKey(jst('2026-07-30T04:00:00'))).toBe('2026-07-30');
        expect(getLogicalDateKey(jst('2026-07-30T12:00:00'))).toBe('2026-07-30');
        expect(getLogicalDateKey(jst('2026-07-30T23:00:00'))).toBe('2026-07-30');
    });

    it('月をまたぐ深夜も正しく前日に寄せる', () => {
        expect(getLogicalDateKey(jst('2026-08-01T02:00:00'))).toBe('2026-07-31');
    });
});

describe('shiftDateKey', () => {
    it('前後に日付をずらせる', () => {
        expect(shiftDateKey('2026-07-29', 1)).toBe('2026-07-30');
        expect(shiftDateKey('2026-07-29', -1)).toBe('2026-07-28');
    });

    it('月・年をまたぐ', () => {
        expect(shiftDateKey('2026-08-01', -1)).toBe('2026-07-31');
        expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('うるう年を扱える', () => {
        expect(shiftDateKey('2028-02-28', 1)).toBe('2028-02-29');
    });
});

describe('getSleepTargetDateKey', () => {
    it('朝の回答は「その夜の原因になった食事の日」に保存される', () => {
        // 7/30 9:00 に「昨夜眠れた？」に回答 → 原因は 7/29 の食事
        expect(getSleepTargetDateKey(jst('2026-07-30T09:00:00'))).toBe('2026-07-29');
    });

    it('昼に回答しても同じ日に紐づく', () => {
        expect(getSleepTargetDateKey(jst('2026-07-30T14:00:00'))).toBe('2026-07-29');
    });

    it('まだ寝ていない深夜 1:00 では前々日を指す', () => {
        // 7/30 1:00 時点では 7/29→7/30 の睡眠はこれから。直近で完了した夜は 7/28 の分
        expect(getSleepTargetDateKey(jst('2026-07-30T01:00:00'))).toBe('2026-07-28');
    });
});

describe('resolveBedtime', () => {
    it('深夜の就寝時刻は翌日として解決する', () => {
        const bed = resolveBedtime('2026-07-29', '01:00');
        expect(bed.toISOString()).toBe('2026-07-29T16:00:00.000Z'); // = 7/30 1:00 JST
    });

    it('日付が変わる前の就寝時刻は同日として解決する', () => {
        const bed = resolveBedtime('2026-07-29', '23:00');
        expect(bed.toISOString()).toBe('2026-07-29T14:00:00.000Z'); // = 7/29 23:00 JST
    });

    it('境界の 4:00 は同日扱い（それ以降は通常の起床時間帯）', () => {
        const bed = resolveBedtime('2026-07-29', '04:00');
        expect(bed.toISOString()).toBe('2026-07-28T19:00:00.000Z'); // = 7/29 4:00 JST
    });

    it('不正な入力は null', () => {
        expect(resolveBedtime('2026-07-29', '')).toBeNull();
        expect(resolveBedtime('2026-07-29', '25:00')).toBeNull();
        expect(resolveBedtime('2026-07-29', '12:70')).toBeNull();
        expect(resolveBedtime('2026-07-29', 'あとで')).toBeNull();
        expect(resolveBedtime('', '01:00')).toBeNull();
    });

    it('既定値は 0:00〜2:00 就寝の想定に合っている', () => {
        expect(DEFAULT_SLEEP_SCHEDULE.bedtime).toBe('01:00');
        expect(resolveBedtime('2026-07-29', DEFAULT_SLEEP_SCHEDULE.bedtime)).not.toBeNull();
    });
});

describe('hoursUntilBedtime', () => {
    it('就寝 1:00 に対して 22:00 の夕食は 3 時間前', () => {
        const hours = hoursUntilBedtime(jst('2026-07-29T22:00:00'), '2026-07-29', '01:00');
        expect(hours).toBe(3);
    });

    it('深夜 0:30 の夜食は就寝 1:00 の 0.5 時間前（前日扱いでも破綻しない）', () => {
        const hours = hoursUntilBedtime(jst('2026-07-30T00:30:00'), '2026-07-29', '01:00');
        expect(hours).toBe(0.5);
    });

    it('就寝後の食事は負値になる', () => {
        const hours = hoursUntilBedtime(jst('2026-07-30T02:00:00'), '2026-07-29', '01:00');
        expect(hours).toBe(-1);
    });

    it('就寝時刻が不明なら null（判定を発火させない）', () => {
        expect(hoursUntilBedtime(jst('2026-07-29T22:00:00'), '2026-07-29', null)).toBeNull();
    });

    it('食事時刻が不正なら null', () => {
        expect(hoursUntilBedtime('not-a-date', '2026-07-29', '01:00')).toBeNull();
    });
});
