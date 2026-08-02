import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  getRecentUniqueMealsAdmin: vi.fn(),
  getMealByIdAdmin: vi.fn(),
  addMealAdmin: vi.fn().mockResolvedValue('new-meal-id'),
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  getRecentUniqueMealsAdmin: mocks.getRecentUniqueMealsAdmin,
  getMealByIdAdmin: mocks.getMealByIdAdmin,
  addMealAdmin: mocks.addMealAdmin,
}));

import {
  handleLogRecentMeal, handleRecentMealsEvent, isRecentMealsText,
} from '@/lib/line/handlers/recent-meals';

const event = {
  type: 'postback',
  postback: { data: 'action=recent_meals' },
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
};

const user = { uid: 'uid-1', data: {} };

const MEALS = [
  { id: 'm1', foodName: '鶏胸肉のグリル', calories: 320, macros: { protein: 45, fat: 8, carbs: 2 } },
  { id: 'm2', foodName: '納豆ごはん', calories: 380, macros: { protein: 16, fat: 6, carbs: 62 } },
];

const lastMessage = () => mocks.replyOrPushMessage.mock.calls[0][1];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRecentUniqueMealsAdmin.mockResolvedValue(MEALS);
  mocks.addMealAdmin.mockResolvedValue('new-meal-id');
});

describe('isRecentMealsText', () => {
  it.each(['履歴', 'りれき', '履歴から', 'いつもの', '前と同じ', '履歴から記録'])(
    'matches %s', (text) => {
      expect(isRecentMealsText(text)).toBe(true);
    });

  it('does not hijack ordinary messages', () => {
    expect(isRecentMealsText('履歴を消したい')).toBe(false);
    expect(isRecentMealsText('ラーメン食べた')).toBe(false);
  });
});

describe('handleRecentMealsEvent', () => {
  it('sends a carousel with a record button per meal', async () => {
    const result = await handleRecentMealsEvent(event, user);

    expect(result.count).toBe(2);
    const message = lastMessage();
    expect(message.type).toBe('flex');
    expect(message.contents.type).toBe('carousel');
    expect(message.contents.contents).toHaveLength(2);

    const first = message.contents.contents[0];
    expect(JSON.stringify(first)).toContain('鶏胸肉のグリル');
    expect(first.footer.contents[0].action).toEqual(expect.objectContaining({
      type: 'postback',
      data: 'action=log_recent&mid=m1',
    }));
  });

  it('caps the carousel at the LINE limit', async () => {
    mocks.getRecentUniqueMealsAdmin.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, foodName: `料理${i}`, calories: 100, macros: {} })),
    );

    await handleRecentMealsEvent(event, user);

    expect(lastMessage().contents.contents.length).toBeLessThanOrEqual(12);
  });

  it('explains what to do when there is no history yet', async () => {
    mocks.getRecentUniqueMealsAdmin.mockResolvedValue([]);

    const result = await handleRecentMealsEvent(event, user);

    expect(result.count).toBe(0);
    expect(lastMessage().text).toContain('まだ記録がありません');
  });
});

describe('handleLogRecentMeal', () => {
  it('copies the nutrition from the original and records it as of now', async () => {
    mocks.getMealByIdAdmin.mockResolvedValue(MEALS[0]);

    const result = await handleLogRecentMeal(event, user, 'm1');

    expect(result.saved).toBe(true);
    const [uid, meal] = mocks.addMealAdmin.mock.calls[0];
    expect(uid).toBe('uid-1');
    expect(meal.foodName).toBe('鶏胸肉のグリル');
    expect(meal.calories).toBe(320);
    expect(meal.macros).toEqual({ protein: 45, fat: 8, carbs: 2 });
    // 記録の時刻は「いま」。元の時刻を引き継ぐと過去の日に入ってしまう
    expect(new Date(meal.timestamp).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('does not carry over the original score', async () => {
    // 点数はその日の文脈で付いたもの。今日の食事として改めて評価されるべき
    mocks.getMealByIdAdmin.mockResolvedValue({ ...MEALS[0], score: 9, reason: '完璧です' });

    await handleLogRecentMeal(event, user, 'm1');

    const [, meal] = mocks.addMealAdmin.mock.calls[0];
    expect(meal.score).toBeUndefined();
    expect(meal.reason).toBeUndefined();
  });

  it('confirms with the meal name and calories', async () => {
    mocks.getMealByIdAdmin.mockResolvedValue(MEALS[0]);

    await handleLogRecentMeal(event, user, 'm1');

    expect(lastMessage().text).toContain('鶏胸肉のグリル');
    expect(lastMessage().text).toContain('320kcal');
  });

  it('says so when the original record is gone', async () => {
    mocks.getMealByIdAdmin.mockResolvedValue(null);

    const result = await handleLogRecentMeal(event, user, 'missing');

    expect(result.saved).toBe(false);
    expect(mocks.addMealAdmin).not.toHaveBeenCalled();
    expect(lastMessage().text).toContain('見つかりませんでした');
  });

  it('asks again when no id came through', async () => {
    const result = await handleLogRecentMeal(event, user, null);

    expect(result.saved).toBe(false);
    expect(mocks.getMealByIdAdmin).not.toHaveBeenCalled();
  });

  it('reports a save failure instead of staying silent', async () => {
    mocks.getMealByIdAdmin.mockResolvedValue(MEALS[0]);
    mocks.addMealAdmin.mockRejectedValue(new Error('firestore down'));

    const result = await handleLogRecentMeal(event, user, 'm1');

    expect(result.saved).toBe(false);
    expect(lastMessage().text).toContain('保存に失敗');
  });
});
