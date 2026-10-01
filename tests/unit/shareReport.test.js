import { describe, expect, it } from 'vitest';
import {
  buildLinePanel, buildShareText, buildTrendSeries, formatShareDate, pickChartMetrics, trendStartDateId,
} from '@/lib/share/shareReport';

const weights = [
  { date: '2026-09-28', weight: 74.6, bodyFat: 22.4 },
  { date: '2026-09-30', weight: 74.30000000001, bodyFat: 22.1, bodyAge: 38 },
  { date: '2026-08-01', weight: 78.0, bodyFat: null },
];

describe('buildShareText', () => {
  it('項目と数値だけを並べる（エレナの口調・絵文字なし）', () => {
    const text = buildShareText({ dateId: '2026-09-30', totalCalories: 1820.4, targetCalories: 2000, weights });
    expect(text).toBe([
      '2026/09/30(水) の記録',
      '摂取カロリー: 1,820 / 2,000 kcal',
      '体重: 74.3 kg（前回比 -0.3 kg）',
      '体脂肪率: 22.1 %',
      '体年齢: 38 歳',
    ].join('\n'));
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it('記録が無い日は 0kcal ではなく未記録と出す', () => {
    const text = buildShareText({ dateId: '2026-09-30', totalCalories: null, targetCalories: 2000, weights: [] });
    expect(text).toContain('摂取カロリー: 未記録（目標 2,000 kcal）');
    expect(text).toContain('体重: 未計測');
  });

  it('当日の計測が無ければ直近の値に計測日を添える。体年齢が無ければ行ごと省く', () => {
    const text = buildShareText({ dateId: '2026-09-29', totalCalories: 1500, targetCalories: null, weights });
    expect(text).toContain('摂取カロリー: 1,500 kcal');
    expect(text).toContain('体重: 74.6 kg（前回比 -3.4 kg）（9/28 計測）');
    expect(text).not.toContain('体年齢');
  });

  it('未来の記録は使わない', () => {
    const text = buildShareText({ dateId: '2026-08-15', totalCalories: 0, targetCalories: 2000, weights });
    expect(text).toContain('摂取カロリー: 0 / 2,000 kcal');
    expect(text).toContain('体重: 78.0 kg（8/1 計測）');
  });
});

describe('formatShareDate', () => {
  it('曜日つきで出す', () => {
    expect(formatShareDate('2026-10-01')).toBe('2026/10/01(木)');
  });
});

describe('buildTrendSeries / pickChartMetrics', () => {
  it('期間内だけを日付順に並べ、値の無い指標はグラフにしない', () => {
    expect(trendStartDateId('2026-10-01', 30)).toBe('2026-09-02');
    const series = buildTrendSeries(weights, '2026-10-01');
    expect(series.map(p => p.date)).toEqual(['2026-09-28', '2026-09-30']);
    expect(pickChartMetrics(series).map(m => m.key)).toEqual(['weight', 'bodyFat', 'bodyAge']);
    expect(pickChartMetrics([{ date: '2026-09-28', weight: 74, bodyFat: null, bodyAge: null }]).map(m => m.key))
      .toEqual(['weight']);
  });
});

describe('buildLinePanel', () => {
  const opts = { width: 100, height: 50, startDateId: '2026-09-01', endDateId: '2026-09-11' };

  it('実際の日数で横位置を決め、値の大きい方を上に描く', () => {
    const panel = buildLinePanel([
      { date: '2026-09-01', weight: 75 },
      { date: '2026-09-11', weight: 74 },
    ], 'weight', opts);
    const [a, b] = panel.segments[0];
    expect(a.x).toBe(0);
    expect(b.x).toBe(100);
    expect(a.y).toBeLessThan(b.y);
    expect(panel.last.value).toBe(74);
  });

  it('値が null の日で線を切る', () => {
    const panel = buildLinePanel([
      { date: '2026-09-01', bodyFat: 22 },
      { date: '2026-09-05', bodyFat: null },
      { date: '2026-09-11', bodyFat: 21 },
    ], 'bodyFat', opts);
    expect(panel.segments).toHaveLength(2);
  });

  it('1点だけでも描ける（上下に余白を取る）', () => {
    const panel = buildLinePanel([{ date: '2026-09-11', weight: 74 }], 'weight', opts);
    expect(panel.min).toBeLessThan(74);
    expect(panel.max).toBeGreaterThan(74);
    expect(panel.segments[0][0].y).toBe(25);
  });

  it('データが無ければ空', () => {
    expect(buildLinePanel([], 'weight', opts).segments).toEqual([]);
  });
});
