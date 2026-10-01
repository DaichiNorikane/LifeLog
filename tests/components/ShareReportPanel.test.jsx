import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ createShareChartPathAction: vi.fn() }));
vi.mock('@/app/actions/share', () => ({ createShareChartPathAction: mocks.createShareChartPathAction }));

import ShareReportPanel from '@/components/ShareReportPanel';

const user = { getIdToken: vi.fn().mockResolvedValue('id-token') };
const weights = [{ date: '2026-10-01', weight: 74.3, bodyFat: 22.1 }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ShareReportPanel', () => {
  it('共有テキストとグラフ画像を出す', async () => {
    mocks.createShareChartPathAction.mockResolvedValue('/api/share/chart?uid=u&exp=1&sig=s');
    render(<ShareReportPanel user={user} dateKey="2026-10-01" totalCalories={1820} targetCalories={2000} weights={weights} />);

    expect(screen.getByTestId('share-text').textContent).toContain('摂取カロリー: 1,820 / 2,000 kcal');
    const img = await screen.findByAltText('体重・体脂肪率の推移グラフ');
    expect(img.getAttribute('src')).toBe('/api/share/chart?uid=u&exp=1&sig=s&date=2026-10-01');
    expect(mocks.createShareChartPathAction).toHaveBeenCalledWith('id-token');
  });

  it('グラフが出せなくてもテキストは共有できる', async () => {
    mocks.createShareChartPathAction.mockResolvedValue(null);
    render(<ShareReportPanel user={user} dateKey="2026-10-01" totalCalories={null} targetCalories={2000} weights={[]} />);
    expect(await screen.findByText(/テキストのみ共有できます/)).toBeTruthy();
  });

  it('テキストをコピーできる', async () => {
    mocks.createShareChartPathAction.mockResolvedValue(null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ShareReportPanel user={user} dateKey="2026-10-01" totalCalories={1820} targetCalories={2000} weights={weights} />);
    fireEvent.click(screen.getByText('テキストをコピー'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('体重: 74.3 kg')));
    expect(await screen.findByText('コピーしました')).toBeTruthy();
  });
});
