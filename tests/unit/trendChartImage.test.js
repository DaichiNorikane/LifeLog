// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildTrendSeries } from '@/lib/share/shareReport';
import { renderTrendChart } from '@/lib/share/trendChartImage';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

describe('renderTrendChart', () => {
  it('記録から PNG を描く（画像生成AIは使わない）', async () => {
    const series = buildTrendSeries([
      { date: '2026-09-20', weight: 75.1, bodyFat: 22.6 },
      { date: '2026-09-25', weight: 74.8, bodyFat: null },
      { date: '2026-10-01', weight: 74.3, bodyFat: 22.1 },
    ], '2026-10-01');
    const response = renderTrendChart(series, '2026-10-01');
    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual(PNG_SIGNATURE);
  }, 30000);

  it('データが無くても落ちない', async () => {
    const response = renderTrendChart([], '2026-10-01');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  }, 30000);
});
