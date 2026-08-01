import { describe, expect, it } from 'vitest';
import {
    ACTIVITY_METRICS, BODY_METRICS, calcFatMass, formatMetric,
    normalizeBodyFatPercent, roundMetric,
} from '@/lib/health/healthMetrics';

describe('healthMetrics', () => {
    it('gives every metric a unique key, a label and a range', () => {
        const all = [...ACTIVITY_METRICS, ...BODY_METRICS];
        const keys = all.map(m => m.key);

        expect(new Set(keys).size).toBe(keys.length);
        for (const metric of all) {
            expect(metric.label).toBeTruthy();
            expect(Number.isFinite(metric.min)).toBe(true);
            expect(Number.isFinite(metric.max)).toBe(true);
            expect(metric.min).toBeLessThan(metric.max);
        }
    });

    it('allows 0 for body metrics so "zero" is never confused with "not measured"', () => {
        for (const metric of BODY_METRICS) {
            if (metric.key === 'weight') continue; // 体重だけは 0 を弾く（別途の明示チェック）
            expect(metric.min).toBe(0);
        }
    });

    describe('roundMetric', () => {
        it('rounds to each metric decimals', () => {
            expect(roundMetric('steps', 8421.6)).toBe(8422);
            expect(roundMetric('distanceKm', 6.2149)).toBe(6.21);
            expect(roundMetric('bodyFat', 25.849)).toBe(25.8);
        });

        it('returns null for null / undefined / non numeric', () => {
            expect(roundMetric('steps', null)).toBeNull();
            expect(roundMetric('steps', undefined)).toBeNull();
            expect(roundMetric('steps', 'many')).toBeNull();
        });

        it('keeps 0 as 0', () => {
            expect(roundMetric('steps', 0)).toBe(0);
        });
    });

    describe('formatMetric', () => {
        it('formats large numbers with separators', () => {
            expect(formatMetric('steps', 8421)).toBe('8,421');
        });

        it('shows ― for missing values', () => {
            expect(formatMetric('steps', null)).toBe('―');
        });

        it('shows 0 rather than ― for a real zero', () => {
            expect(formatMetric('steps', 0)).toBe('0');
        });
    });

    describe('calcFatMass', () => {
        it('derives fat mass in kg from weight and body fat percentage', () => {
            expect(calcFatMass(82.6, 25.8)).toBe(21.31);
        });

        it('returns null when either input is missing', () => {
            expect(calcFatMass(82.6, null)).toBeNull();
            expect(calcFatMass(null, 25.8)).toBeNull();
        });
    });

    describe('normalizeBodyFatPercent', () => {
        it('converts a 0-1 ratio into a percentage', () => {
            expect(normalizeBodyFatPercent(0.258)).toBe(25.8);
        });

        it('leaves an already-percentage value alone', () => {
            expect(normalizeBodyFatPercent(25.8)).toBe(25.8);
        });

        it('treats an empty string as not measured, not as zero', () => {
            expect(normalizeBodyFatPercent('')).toBeNull();
            expect(normalizeBodyFatPercent('  ')).toBeNull();
        });

        it('keeps a real 0 as 0', () => {
            expect(normalizeBodyFatPercent(0)).toBe(0);
        });
    });
});
