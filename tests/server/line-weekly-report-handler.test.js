import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  getJstDateId: vi.fn().mockReturnValue('2026-08-16'),
  collectWeeklyStats: vi.fn(),
  getWeekDates: vi.fn(),
  getWeeklyComment: vi.fn().mockReturnValue('いい感じです！'),
  buildWeeklyReportText: vi.fn(),
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  getJstDateId: mocks.getJstDateId,
}));

vi.mock('@/lib/reports/weeklyReport', async () => {
  const actual = await vi.importActual('@/lib/reports/weeklyReport');
  return {
    ...actual,
    collectWeeklyStats: mocks.collectWeeklyStats,
    getWeeklyComment: mocks.getWeeklyComment,
  };
});

// weeklyReport.js は admin の db を import するので、初期化を止める
vi.mock('@/lib/firebase/admin', () => ({ db: {} }));

import { handleWeeklyReportEvent, isWeeklyReportText } from '@/lib/line/handlers/weekly-report';
import { buildWeeklyReportText, getWeekDates } from '@/lib/reports/weeklyReport';

const event = {
  type: 'message',
  message: { type: 'text', text: '週間レポート' },
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
};

const user = { uid: 'uid-1', data: {} };

const lastMessage = () => mocks.replyOrPushMessage.mock.calls[0][1];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getJstDateId.mockReturnValue('2026-08-16');
  mocks.getWeeklyComment.mockReturnValue('いい感じです！');
  mocks.collectWeeklyStats.mockResolvedValue({
    weekStart: '2026-08-09',
    weekEnd: '2026-08-15',
    recordDays: 5,
    avgScore: 7,
    weightText: '\n体重: 78kg → 77.4kg (-0.6kg)',
  });
});

describe('isWeeklyReportText', () => {
  it.each(['週間レポート', '今週のふりかえり', '今週のまとめ', '週間まとめ'])('matches %s', (text) => {
    expect(isWeeklyReportText(text)).toBe(true);
  });

  it('requires a weekly word so it does not shadow the daily summary', () => {
    expect(isWeeklyReportText('まとめ')).toBe(false);
    expect(isWeeklyReportText('レポート')).toBe(false);
    expect(isWeeklyReportText('サマリー')).toBe(false);
  });
});

describe('handleWeeklyReportEvent', () => {
  it('replies with the aggregated weekly report', async () => {
    const result = await handleWeeklyReportEvent(event, user);

    expect(result.recordDays).toBe(5);
    const text = lastMessage().text;
    expect(text).toContain('週間レポート');
    expect(text).toContain('2026-08-09 〜 2026-08-15');
    expect(text).toContain('記録日数: 5/7日');
    expect(text).toContain('平均スコア: 7点');
    expect(text).toContain('78kg → 77.4kg');
    expect(text).toContain('いい感じです！');
  });

  it('guides to 総評 when the week has no evaluations yet', async () => {
    mocks.collectWeeklyStats.mockResolvedValue({
      weekStart: '2026-08-09', weekEnd: '2026-08-15', recordDays: 0, avgScore: '-', weightText: '',
    });

    const result = await handleWeeklyReportEvent(event, user);

    expect(result.recordDays).toBe(0);
    expect(lastMessage().text).toContain('総評');
  });
});

describe('weeklyReport pure helpers', () => {
  it('getWeekDates returns the 7 days before today (JST)', () => {
    const dates = getWeekDates('2026-08-16');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-08-09');
    expect(dates.at(-1)).toBe('2026-08-15');
  });

  it('buildWeeklyReportText matches the cron message format', () => {
    const text = buildWeeklyReportText({
      weekStart: '2026-08-09',
      weekEnd: '2026-08-15',
      recordDays: 7,
      avgScore: 8,
      weightText: '',
      comment: '完璧！',
      insightText: '',
    });
    expect(text).toContain('【週間レポート by エレナ 📊】');
    expect(text).toContain('期間: 2026-08-09 〜 2026-08-15');
    expect(text).toContain('エレナ: 完璧！');
  });
});
