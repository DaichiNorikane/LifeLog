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
