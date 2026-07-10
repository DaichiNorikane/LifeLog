import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getLineChatContextAdmin: vi.fn(),
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  resolveUserOrReply: vi.fn().mockResolvedValue({ uid: 'uid-1', data: {} }),
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  getLineChatContextAdmin: mocks.getLineChatContextAdmin,
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/line/resolveUser', () => ({
  resolveUserOrReply: mocks.resolveUserOrReply,
}));

import { handleDailySummaryEvent, isDailySummaryText } from '@/lib/line/handlers/daily-summary';

const event = {
  type: 'message',
  message: { id: 'msg-1', type: 'text', text: 'サマリー' },
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
};

const contextWithMeals = {
  user: { targetCalories: 2000 },
  today: {
    dateId: '2026-07-10',
    meals: [{ id: 'meal-1' }, { id: 'meal-2' }],
    totalCalories: 1250,
    totalMacros: { protein: 60, fat: 35, carbs: 150, fiber: 8, sugar: null, sodium: 2100, potassium: null },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveUserOrReply.mockResolvedValue({ uid: 'uid-1', data: {} });
});

describe('isDailySummaryText', () => {
  it('matches summary queries', () => {
    expect(isDailySummaryText('サマリー')).toBe(true);
    expect(isDailySummaryText('今日のカロリー')).toBe(true);
    expect(isDailySummaryText('今日の栄養どう？')).toBe(true);
    expect(isDailySummaryText('進捗')).toBe(true);
  });

  it('does not match meal logging or chat text', () => {
    expect(isDailySummaryText('カロリーメイト食べた')).toBe(false);
    expect(isDailySummaryText('カロリー高いものが食べたい')).toBe(false);
    expect(isDailySummaryText('こんにちは')).toBe(false);
  });
});

describe('handleDailySummaryEvent', () => {
  it('replies with a summary flex card including progress bars', async () => {
    mocks.getLineChatContextAdmin.mockResolvedValue(contextWithMeals);

    const result = await handleDailySummaryEvent(event);

    expect(result).toEqual({ mealsCount: 2 });
    const flex = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(flex.type).toBe('flex');
    expect(flex.altText).toBe('今日の栄養サマリー: 1250 / 2000kcal');
    const json = JSON.stringify(flex);
    expect(json).toContain('残り 750kcal 食べられます');
    expect(json).toContain('タンパク質 P');
    // 未取得の栄養素（null）は ― 表示
    expect(json).toContain('―');
  });

  it('caps progress bar width at 100% when over target', async () => {
    mocks.getLineChatContextAdmin.mockResolvedValue({
      ...contextWithMeals,
      today: { ...contextWithMeals.today, totalCalories: 2600 },
    });

    await handleDailySummaryEvent(event);

    const json = JSON.stringify(mocks.replyOrPushMessage.mock.calls[0][1]);
    expect(json).toContain('600kcal オーバーしています');
    expect(json).not.toContain('"width":"130%"');
  });

  it('replies with a friendly text when no meals are recorded', async () => {
    mocks.getLineChatContextAdmin.mockResolvedValue({
      user: { targetCalories: 2000 },
      today: { dateId: '2026-07-10', meals: [], totalCalories: 0, totalMacros: {} },
    });

    const result = await handleDailySummaryEvent(event);

    expect(result).toEqual({ mealsCount: 0 });
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(event, expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('まだ今日の記録がありません'),
    }));
  });
});
