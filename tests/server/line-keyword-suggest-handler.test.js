import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  resolveUserOrReply: vi.fn(),
  suggestNextMeal: vi.fn(),
  mealsGet: vi.fn(),
  mealsFirstWhere: vi.fn(),
  mealsSecondWhere: vi.fn(),
  stockGet: vi.fn(),
  userDoc: vi.fn(),
  dbCollection: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: mocks.dbCollection,
  },
}));

vi.mock('@/app/actions/meal-advisor', () => ({
  suggestNextMeal: mocks.suggestNextMeal,
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/line/resolveUser', () => ({
  resolveUserOrReply: mocks.resolveUserOrReply,
}));

import { handleKeywordSuggestEvent } from '@/lib/line/handlers/keyword-suggest';

const event = {
  type: 'message',
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
  message: { type: 'text', text: '昼食' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.replyOrPushMessage.mockResolvedValue({ success: true });
  mocks.resolveUserOrReply.mockResolvedValue({
    uid: 'uid-1',
    data: { targetCalories: 1800 },
  });
  mocks.mealsGet.mockResolvedValue({
    docs: [
      { data: () => ({ foodName: '朝食', calories: 350 }) },
      { data: () => ({ foodName: 'プロテイン', calories: 120 }) },
    ],
  });
  mocks.stockGet.mockResolvedValue({
    docs: [
      { data: () => ({ name: '鶏むね肉' }) },
      { data: () => ({ name: '卵' }) },
    ],
  });
  mocks.suggestNextMeal.mockResolvedValue({
    advice: '昼はたんぱく質を足していこ！',
    suggestions: [
      { name: '鶏むねサンド', reason: 'Pを確保できる' },
      { name: 'ゆで卵サラダ', reason: '軽めで調整しやすい' },
    ],
  });
  mocks.mealsSecondWhere.mockReturnValue({ get: mocks.mealsGet });
  mocks.mealsFirstWhere.mockReturnValue({ where: mocks.mealsSecondWhere });
  mocks.userDoc.mockReturnValue({
    collection: vi.fn((name) => {
      if (name === 'meals') return { where: mocks.mealsFirstWhere };
      if (name === 'stockItems') return { get: mocks.stockGet };
      return {};
    }),
  });
  mocks.dbCollection.mockImplementation((name) => {
    if (name === 'users') return { doc: mocks.userDoc };
    return {};
  });
});

describe('LINE keyword suggestion handler', () => {
  it('returns lunch suggestions for the 昼食 keyword', async () => {
    await handleKeywordSuggestEvent(event, 'lunch');

    expect(mocks.resolveUserOrReply).toHaveBeenCalledWith(event);
    expect(mocks.suggestNextMeal).toHaveBeenCalledWith(
      [
        { foodName: '朝食', calories: 350 },
        { foodName: 'プロテイン', calories: 120 },
      ],
      { totalCalories: 470, targetCalories: 1800 },
      'lunch',
      [{ name: '鶏むね肉' }, { name: '卵' }],
    );
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(event, expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('昼はたんぱく質を足していこ！'),
    }));
    expect(mocks.replyOrPushMessage.mock.calls[0][1].text).toContain('鶏むねサンド');
    expect(mocks.replyOrPushMessage.mock.calls[0][1].text).toContain('【おすすめメニュー】');
  });

  it('returns the fallback guidance when suggestNextMeal fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.suggestNextMeal.mockRejectedValue(new Error('Gemini down'));

    await handleKeywordSuggestEvent(event, 'lunch');

    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(event, expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('うまく考えられませんでした'),
    }));
    consoleError.mockRestore();
  });
});
