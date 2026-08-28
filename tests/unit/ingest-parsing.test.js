import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFirebaseAdminMock } from '../mocks/firebase-admin.js';

const firebaseMocks = setupFirebaseAdminMock(vi);

/** users/{uid}/activityLogs/{date} まで辿れるようにチェーンを組む */
const wireFirestoreChain = () => {
    firebaseMocks.mockSet.mockResolvedValue(undefined);
    firebaseMocks.mockDoc.mockReturnValue({
        collection: () => ({ doc: () => ({ set: firebaseMocks.mockSet }) }),
    });
    firebaseMocks.mockCollection.mockImplementation((name) =>
        name === 'users' ? { doc: firebaseMocks.mockDoc } : {}
    );
};

/**
 * iOSショートカットは「統計を計算」の結果を、数値ではなく表示用の文字列で送ってくることがある。
 * ここを弾くと「送っているのに null になる」という原因の分かりにくい失敗になるため、
 * 表示形式を許容しつつ、null と 0 の区別だけは絶対に崩さないことを担保する。
 */
describe('toFiniteNumber', () => {
    let toFiniteNumber;

    beforeEach(async () => {
        vi.resetModules();
        ({ toFiniteNumber } = await import('@/lib/health/ingest'));
    });

    it('accepts plain numbers and numeric strings', () => {
        expect(toFiniteNumber(8421)).toBe(8421);
        expect(toFiniteNumber('8421')).toBe(8421);
        expect(toFiniteNumber('82.6')).toBe(82.6);
        expect(toFiniteNumber('-3')).toBe(-3);
    });

    it('accepts numbers formatted with thousands separators', () => {
        expect(toFiniteNumber('8,421')).toBe(8421);
        expect(toFiniteNumber('1,754')).toBe(1754);
    });

    it('accepts numbers with a trailing unit', () => {
        expect(toFiniteNumber('8,421 歩')).toBe(8421);
        expect(toFiniteNumber('82.6 kg')).toBe(82.6);
        expect(toFiniteNumber('59.2kcal')).toBe(59.2);
        expect(toFiniteNumber('6.2 km')).toBe(6.2);
        expect(toFiniteNumber('25.8%')).toBe(25.8);
    });

    it('accepts full width digits', () => {
        expect(toFiniteNumber('８４２１')).toBe(8421);
        expect(toFiniteNumber('８，４２１歩')).toBe(8421);
    });

    it('keeps 0 as 0 rather than treating it as missing', () => {
        expect(toFiniteNumber(0)).toBe(0);
        expect(toFiniteNumber('0')).toBe(0);
        expect(toFiniteNumber('0 歩')).toBe(0);
    });

    it('returns null for values that were never measured', () => {
        expect(toFiniteNumber(null)).toBeNull();
        expect(toFiniteNumber(undefined)).toBeNull();
        expect(toFiniteNumber('')).toBeNull();
        expect(toFiniteNumber('   ')).toBeNull();
    });

    it('returns null rather than inventing a number from non numeric text', () => {
        expect(toFiniteNumber('データなし')).toBeNull();
        expect(toFiniteNumber('歩数')).toBeNull();
        expect(toFiniteNumber(NaN)).toBeNull();
        expect(toFiniteNumber(Infinity)).toBeNull();
    });
});

describe('writeActivity diagnostics', () => {
    let writeActivity;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        wireFirestoreChain();
        ({ writeActivity } = await import('@/lib/health/ingest'));
    });

    it('reports values that arrived but could not be parsed', async () => {
        const result = await writeActivity('user1', {
            steps: 'データなし',
            activeEnergy: '412',
            capturedAt: '2026-08-01T03:00:00Z',
        });

        expect(result.ok).toBe(true);
        expect(result.metrics.steps).toBeNull();
        expect(result.metrics.activeEnergy).toBe(412);
        // 何が届いたのかを返さないと、設定ミスの切り分けができない
        expect(result.rejected).toEqual({ steps: 'データなし' });
    });

    it('does not report empty values as rejected (they are simply not measured)', async () => {
        const result = await writeActivity('user1', {
            steps: '',
            capturedAt: '2026-08-01T03:00:00Z',
        });

        expect(result.metrics.steps).toBeNull();
        expect(result.rejected).toBeUndefined();
    });

    it('does not report anything when every value parsed', async () => {
        const result = await writeActivity('user1', {
            steps: '8,421 歩',
            capturedAt: '2026-08-01T03:00:00Z',
        });

        expect(result.metrics.steps).toBe(8421);
        expect(result.rejected).toBeUndefined();
    });
});

/**
 * iOSショートカットの「開始日 / 終了日」は Date 型で、JSON のテキスト欄に置くと
 * 端末のロケール表記のまま送られてくる。`new Date()` はこれを読めないため、
 * 実機では睡眠だけが 'Missing or invalid sleepEnd' で落ち続けていた。
 *
 * タイムゾーンを持たない表記は JST の壁時計として組み立てることも担保する。
 * 実行環境（Vercel）は UTC なので、ここを取り違えると 9 時間ずれて保存される。
 */
describe('parseDateInput', () => {
    let parseDateInput;

    beforeEach(async () => {
        vi.resetModules();
        ({ parseDateInput } = await import('@/lib/health/ingest'));
    });

    const iso = (value) => parseDateInput(value)?.toISOString() ?? null;

    it('trusts ISO 8601 that carries its own offset', () => {
        expect(iso('2026-08-21T07:30:00+09:00')).toBe('2026-08-20T22:30:00.000Z');
        expect(iso('2026-08-21T07:30:00Z')).toBe('2026-08-21T07:30:00.000Z');
        expect(iso('2026-08-21T07:30:00.500+09:00')).toBe('2026-08-20T22:30:00.500Z');
    });

    it('reads the Japanese locale format the Shortcuts app actually sends', () => {
        expect(iso('2026年8月21日 7:30')).toBe('2026-08-20T22:30:00.000Z');
        expect(iso('2026年8月21日 23:45')).toBe('2026-08-21T14:45:00.000Z');
        expect(iso('2026/08/21 7:30')).toBe('2026-08-20T22:30:00.000Z');
    });

    it('reads the long and full formats, weekday and units included', () => {
        expect(iso('2026年8月21日金曜日 7時30分00秒')).toBe('2026-08-20T22:30:00.000Z');
        expect(iso('2026/08/21(金) 7:30')).toBe('2026-08-20T22:30:00.000Z');
    });

    it('converts 午前 / 午後 to 24 hour time', () => {
        expect(iso('2026年8月21日 午後7:30')).toBe('2026-08-21T10:30:00.000Z');
        expect(iso('2026年8月21日 午前7:30')).toBe('2026-08-20T22:30:00.000Z');
        // 正午と深夜は素朴に +12 すると壊れる
        expect(iso('2026年8月21日 午前12:05')).toBe('2026-08-20T15:05:00.000Z');
        expect(iso('2026年8月21日 午後12:05')).toBe('2026-08-21T03:05:00.000Z');
    });

    it('accepts full width digits and separators', () => {
        expect(iso('２０２６年８月２１日 ７：３０')).toBe('2026-08-20T22:30:00.000Z');
    });

    it('treats a missing timezone as JST rather than the server timezone', () => {
        // 実行環境が UTC でも JST として読む。ここが崩れると 9 時間ずれる
        expect(iso('2026-08-21T07:30:00')).toBe('2026-08-20T22:30:00.000Z');
        expect(iso('2026-08-21')).toBe('2026-08-20T15:00:00.000Z');
    });

    it('honours an explicit timezone when the string carries one', () => {
        expect(iso('2026年8月21日 7:30:00 日本標準時')).toBe('2026-08-20T22:30:00.000Z');
        expect(iso('2026年8月21日 7:30:00 JST')).toBe('2026-08-20T22:30:00.000Z');
        expect(iso('2026年8月21日 7:30:00 GMT+2')).toBe('2026-08-21T05:30:00.000Z');
    });

    it('passes a Date straight through', () => {
        const date = new Date('2026-08-21T07:30:00Z');
        expect(parseDateInput(date)).toBe(date);
        expect(parseDateInput(new Date('nope'))).toBeNull();
    });

    it('returns null rather than inventing a date', () => {
        expect(parseDateInput('')).toBeNull();
        expect(parseDateInput('   ')).toBeNull();
        expect(parseDateInput(null)).toBeNull();
        expect(parseDateInput(undefined)).toBeNull();
        expect(parseDateInput('データなし')).toBeNull();
        expect(parseDateInput(12345)).toBeNull();
    });

    it('rejects dates that do not exist instead of rolling them over', () => {
        // Date.UTC は 2月31日を3月3日に繰り上げてしまう
        expect(parseDateInput('2026年2月31日 7:30')).toBeNull();
        expect(parseDateInput('2026年13月1日 7:30')).toBeNull();
        expect(parseDateInput('2026年8月21日 25:30')).toBeNull();
    });
});

/**
 * 睡眠は実機で唯一落ち続けていた経路。ロケール表記でも通ること、
 * それでも読めなかったときは「何が届いたか」を返すことを担保する。
 */
describe('writeSleep date handling', () => {
    let writeSleep;
    const mockLogGet = vi.fn();

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        firebaseMocks.mockSet.mockResolvedValue(undefined);
        mockLogGet.mockResolvedValue({ exists: false, data: () => null });
        firebaseMocks.mockDoc.mockReturnValue({
            collection: () => ({ doc: () => ({ set: firebaseMocks.mockSet, get: mockLogGet }) }),
        });
        firebaseMocks.mockCollection.mockImplementation((name) =>
            name === 'users' ? { doc: firebaseMocks.mockDoc } : {}
        );
        ({ writeSleep } = await import('@/lib/health/ingest'));
    });

    it('accepts the locale format and derives time in bed from it', async () => {
        const result = await writeSleep('user1', {
            sleepStart: '2026年8月20日 23:45',
            sleepEnd: '2026年8月21日 7:30',
        });

        expect(result.ok).toBe(true);
        expect(result.sleep.inBedMinutes).toBe(465);
        // 睡眠はその夜を引き起こした食事の日に帰属する（起床日の前日）
        expect(result.date).toBe('2026-08-20');
    });

    it('reports what arrived when the value still cannot be read', async () => {
        const empty = await writeSleep('user1', { sleepEnd: '' });
        expect(empty.ok).toBe(false);
        // 空＝ヘルスケアに睡眠が無い。書式ミスと区別できるようにする
        expect(empty.received).toBe('');

        const garbage = await writeSleep('user1', { sleepEnd: 'データなし' });
        expect(garbage.received).toBe('データなし');
    });
});
