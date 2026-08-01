/**
 * Tests for buildConditionContextAdmin (src/lib/firebase/adminHelpers.js)
 *
 * LINE 通知・チャットに渡すコンディション要約。
 * 決定論エンジンを使うので Gemini の追加呼び出しは発生しない。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFirebaseAdminMock } from '../../mocks/firebase-admin.js';

setupFirebaseAdminMock(vi);

let buildConditionContextAdmin;

const at = (hhmm, day = '2026-07-29') => new Date(`${day}T${hhmm}:00+09:00`);

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

const fullDay = () => [
  meal({ mealType: 'breakfast', timestamp: at('08:00').toISOString(), calories: 400 }),
  meal({ mealType: 'lunch', timestamp: at('12:30').toISOString(), calories: 600 }),
  meal({ mealType: 'dinner', timestamp: at('19:00').toISOString(), calories: 600 }),
];

const PROFILE = { bedtime: '01:00', targetCalories: 2200, currentWeight: 70 };

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  ({ buildConditionContextAdmin } = await import('@/lib/firebase/adminHelpers'));
});

describe('buildConditionContextAdmin', () => {
  it('4軸のスコアを返す', () => {
    const context = buildConditionContextAdmin(fullDay(), PROFILE, at('22:00'));
    expect(context).not.toBeNull();
    expect(context.scores.focus).toBeTypeOf('number');
    expect(context.scores.sleep).toBeTypeOf('number');
  });

  it('記録が無ければ null を返す（無理に体調を語らせない）', () => {
    expect(buildConditionContextAdmin([], PROFILE, at('22:00'))).toBeNull();
  });

  it('栄養素がまったく無い記録でも null になる', () => {
    const bare = [{ foodName: 'なにか', calories: 500, mealType: 'lunch', timestamp: at('12:00').toISOString(), macros: { protein: 20, fat: 10, carbs: 60 } }];
    expect(buildConditionContextAdmin(bare, PROFILE, at('22:00'))).toBeNull();
  });

  it('最も響いた要因を返す', () => {
    const meals = [
      ...fullDay(),
      meal({ foodName: 'コーヒー', mealType: 'snack', calories: 5, timestamp: at('15:00').toISOString(), macros: { caffeine: 90 } }),
      meal({ foodName: 'コーヒー', mealType: 'snack', calories: 5, timestamp: at('18:00').toISOString(), macros: { caffeine: 90 } }),
    ];
    const context = buildConditionContextAdmin(meals, PROFILE, at('22:00'));
    expect(context.topNegative.label).toBe('午後以降のカフェイン');
    expect(context.topNegative.axis).toBe('sleep');
  });

  it('睡眠スコアが低ければ通知用の一文を返す', () => {
    const meals = [
      ...fullDay(),
      meal({ foodName: 'コーヒー', mealType: 'snack', calories: 5, timestamp: at('15:00').toISOString(), macros: { caffeine: 90 } }),
      meal({ foodName: 'コーヒー', mealType: 'snack', calories: 5, timestamp: at('18:00').toISOString(), macros: { caffeine: 90 } }),
      meal({ foodName: 'アイス', mealType: 'snack', calories: 280, timestamp: at('23:30').toISOString() }),
    ];
    const context = buildConditionContextAdmin(meals, PROFILE, at('23:45'));
    expect(context.sleepNote).toContain('今夜の眠り');
  });

  it('睡眠スコアが十分高ければ通知用の一文は出さない', () => {
    const context = buildConditionContextAdmin(fullDay(), PROFILE, at('22:00'));
    expect(context.sleepNote).toBeNull();
  });

  it('論理日で集計する（深夜の食事を前日に含める）', () => {
    const meals = [
      ...fullDay(),
      meal({ foodName: '夜食', mealType: 'snack', timestamp: at('01:00', '2026-07-30').toISOString() }),
    ];
    // 7/30 の 1:00 時点＝論理日はまだ 7/29
    const context = buildConditionContextAdmin(meals, PROFILE, at('01:30', '2026-07-30'));
    expect(context.dateKey).toBe('2026-07-29');
  });

  it('就寝時刻が未設定でも落ちない（睡眠は参考値に落ちる）', () => {
    const context = buildConditionContextAdmin(fullDay(), { targetCalories: 2200 }, at('22:00'));
    expect(context).not.toBeNull();
    expect(context.result.axes.sleep.confidence).toBe('low');
  });

  it('プロフィールが空でも落ちない', () => {
    expect(() => buildConditionContextAdmin(fullDay(), {}, at('22:00'))).not.toThrow();
  });

  it('引数なしでも落ちない', () => {
    expect(() => buildConditionContextAdmin()).not.toThrow();
  });
});
