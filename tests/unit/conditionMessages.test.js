/**
 * Tests for src/lib/health/conditionMessages.js
 *
 * 通知は決定論で作る（AI を呼ばない）。カード表示と必ず一致することを担保する。
 */
import { describe, it, expect } from 'vitest';
import {
    buildEveningSleepNote,
    buildMorningFocusNote,
    NOTIFY_THRESHOLD,
} from '@/lib/health/conditionMessages';

const axis = (score, confidence, drivers = []) => ({ score, grade: 'warn', confidence, drivers });
const result = (axes) => ({ axes });

const caffeineDriver = { key: 'caffeine_late', label: '午後以降のカフェイン', delta: -24 };
const lateMealDriver = { key: 'late_meal', label: '就寝直前の食事', delta: -15 };

describe('buildEveningSleepNote', () => {
    it('スコアが低いとき、原因に応じた具体的な行動を返す', () => {
        const note = buildEveningSleepNote(result({ sleep: axis(38, 'high', [caffeineDriver]) }));
        expect(note).toContain('今夜の眠り 38点');
        expect(note).toContain('カフェイン');
    });

    it('原因ごとに文面が変わる', () => {
        const a = buildEveningSleepNote(result({ sleep: axis(40, 'high', [caffeineDriver]) }));
        const b = buildEveningSleepNote(result({ sleep: axis(40, 'high', [lateMealDriver]) }));
        expect(a).not.toBe(b);
        expect(b).toContain('3時間前');
    });

    it('最も減点の大きいドライバーを選ぶ', () => {
        const note = buildEveningSleepNote(result({
            sleep: axis(30, 'high', [caffeineDriver, lateMealDriver]),
        }));
        expect(note).toContain('カフェイン');
    });

    it('加点ドライバーしか無ければ汎用文になる', () => {
        const note = buildEveningSleepNote(result({
            sleep: axis(50, 'high', [{ key: 'magnesium_sufficient', label: 'マグネシウム', delta: 5 }]),
        }));
        expect(note).toContain('今夜の眠り 50点');
        expect(note).toContain('🌙');
    });

    it('未知のドライバーでも汎用文で落ちない', () => {
        const note = buildEveningSleepNote(result({
            sleep: axis(45, 'high', [{ key: 'unknown_driver', label: '謎', delta: -9 }]),
        }));
        expect(note).toBeTruthy();
    });

    it('スコアが十分高ければ黙る（余計な通知をしない）', () => {
        expect(buildEveningSleepNote(result({ sleep: axis(NOTIFY_THRESHOLD, 'high', [caffeineDriver]) }))).toBeNull();
        expect(buildEveningSleepNote(result({ sleep: axis(80, 'high', [caffeineDriver]) }))).toBeNull();
    });

    it('閾値の1点下では通知する', () => {
        expect(buildEveningSleepNote(result({ sleep: axis(NOTIFY_THRESHOLD - 1, 'high', [caffeineDriver]) }))).toBeTruthy();
    });

    it('信頼できないスコアでは通知しない', () => {
        expect(buildEveningSleepNote(result({ sleep: axis(30, 'low', [caffeineDriver]) }))).toBeNull();
        expect(buildEveningSleepNote(result({ sleep: axis(null, 'insufficient', []) }))).toBeNull();
    });

    it('結果が無くても落ちない', () => {
        expect(buildEveningSleepNote(null)).toBeNull();
        expect(buildEveningSleepNote({})).toBeNull();
        expect(buildEveningSleepNote({ axes: {} })).toBeNull();
    });
});

describe('buildMorningFocusNote', () => {
    it('原因が分かっている時だけ通知する', () => {
        const note = buildMorningFocusNote(result({
            focus: axis(40, 'high', [{ key: 'breakfast_skipped', label: '朝食抜き', delta: -10 }]),
        }));
        expect(note).toContain('集中力 40点');
        expect(note).toContain('タンパク質');
    });

    it('定型文が用意されていない原因なら黙る（汎用論を垂れ流さない）', () => {
        expect(buildMorningFocusNote(result({
            focus: axis(40, 'high', [{ key: 'saturated_fat_high', label: '飽和脂肪酸', delta: -5 }]),
        }))).toBeNull();
    });

    it('スコアが高ければ黙る', () => {
        expect(buildMorningFocusNote(result({
            focus: axis(75, 'high', [{ key: 'breakfast_skipped', label: '朝食抜き', delta: -10 }]),
        }))).toBeNull();
    });

    it('結果が無くても落ちない', () => {
        expect(buildMorningFocusNote(null)).toBeNull();
    });
});
