import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const evalDocSet = vi.fn().mockResolvedValue(undefined);
  return {
    evalDocSet,
    replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
    getLineChatContextAdmin: vi.fn(),
    evaluateDailyLog: vi.fn(),
  };
});

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  getLineChatContextAdmin: mocks.getLineChatContextAdmin,
}));

vi.mock('@/app/actions/daily-evaluation', () => ({
  evaluateDailyLog: mocks.evaluateDailyLog,
}));

vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({ set: mocks.evalDocSet })),
        })),
      })),
    })),
  },
}));

import { buildDailyReviewFlex, handleDailyReviewEvent, isDailyReviewText } from '@/lib/line/handlers/daily-review';

const event = {
  type: 'message',
  message: { type: 'text', text: '今日の総評' },
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
};

const user = { uid: 'uid-1', data: {} };

const context = {
  user: { targetCalories: 1800, currentWeight: 78, targetWeight: 72, targetDate: '2026-12-31' },
  today: {
    dateId: '2026-08-16',
    meals: [{ foodName: 'サラダチキン', calories: 120, mealType: 'lunch' }],
    totalCalories: 120,
    totalMacros: { protein: 25, fat: 2, carbs: 1 },
  },
  stockItems: [{ name: '卵' }],
};

const lastMessage = () => mocks.replyOrPushMessage.mock.calls[0][1];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLineChatContextAdmin.mockResolvedValue(context);
  mocks.evaluateDailyLog.mockResolvedValue({
    score: 8, title: '素晴らしい！', advice: 'この調子です✨', characterStatus: 'CHEER',
  });
});

describe('isDailyReviewText', () => {
  it.each(['総評', '今日の総評', '評価', '今日の評価', '採点', '評価して'])('matches %s', (text) => {
    expect(isDailyReviewText(text)).toBe(true);
  });

  it('does not hijack ordinary messages', () => {
    expect(isDailyReviewText('総評を見たあとにラーメン食べた')).toBe(false);
    expect(isDailyReviewText('サマリー')).toBe(false);
  });
});

describe('handleDailyReviewEvent', () => {
  it('replies with a score flex and saves the evaluation like the cron does', async () => {
    const result = await handleDailyReviewEvent(event, user);

    expect(result.score).toBe(8);
    expect(mocks.evaluateDailyLog).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-08-16',
      consumedCalories: 120,
      targetCalories: 1800,
    }), context.stockItems);

    // 週間レポートの集計対象になるよう daily_evaluations にも保存する
    expect(mocks.evalDocSet).toHaveBeenCalledWith(expect.objectContaining({ score: 8 }));

    const message = lastMessage();
    expect(message.type).toBe('flex');
    expect(message.altText).toContain('8点');
    expect(JSON.stringify(message)).toContain('素晴らしい！');
    expect(JSON.stringify(message)).toContain('この調子です✨');
  });

  it('asks for records first when nothing is logged today', async () => {
    mocks.getLineChatContextAdmin.mockResolvedValue({
      ...context,
      today: { ...context.today, meals: [] },
    });

    const result = await handleDailyReviewEvent(event, user);

    expect(result.mealsCount).toBe(0);
    expect(mocks.evaluateDailyLog).not.toHaveBeenCalled();
    expect(lastMessage().text).toContain('まだ今日の記録がありません');
  });

  it('fails gracefully when the evaluation errors out', async () => {
    mocks.evaluateDailyLog.mockResolvedValue({ error: 'boom' });

    const result = await handleDailyReviewEvent(event, user);

    expect(result.error).toBe('boom');
    expect(mocks.evalDocSet).not.toHaveBeenCalled();
    expect(lastMessage().text).toContain('ごめんなさい');
  });

  it('still replies when the evaluation save fails', async () => {
    mocks.evalDocSet.mockRejectedValue(new Error('firestore down'));

    await handleDailyReviewEvent(event, user);

    expect(lastMessage().type).toBe('flex');
  });
});

describe('buildDailyReviewFlex', () => {
  it('colors the score by its value', () => {
    const good = JSON.stringify(buildDailyReviewFlex({ score: 9, title: 'a', advice: 'b' }));
    const mid = JSON.stringify(buildDailyReviewFlex({ score: 5, title: 'a', advice: 'b' }));
    const bad = JSON.stringify(buildDailyReviewFlex({ score: 2, title: 'a', advice: 'b' }));
    expect(good).toContain('#10B981');
    expect(mid).toContain('#F59E0B');
    expect(bad).toContain('#EF4444');
  });
});
