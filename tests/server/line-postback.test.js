import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addMealAdmin: vi.fn().mockResolvedValue('meal-1'),
  evaluateSingleMeal: vi.fn().mockResolvedValue({ score: 8, reason: 'いい感じ！' }),
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  resolveUserOrReply: vi.fn().mockResolvedValue({ uid: 'uid-1', data: {} }),
  clearLineState: vi.fn().mockResolvedValue(undefined),
  getActiveLineState: vi.fn(),
  setLineState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/app/actions/daily-evaluation', () => ({
  evaluateSingleMeal: mocks.evaluateSingleMeal,
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  addMealAdmin: mocks.addMealAdmin,
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/line/resolveUser', () => ({
  resolveUserOrReply: mocks.resolveUserOrReply,
}));

vi.mock('@/lib/line/state', () => ({
  clearLineState: mocks.clearLineState,
  getActiveLineState: mocks.getActiveLineState,
  setLineState: mocks.setLineState,
}));

import { EXPIRED_CARD_MESSAGE, handlePostbackEvent } from '@/lib/line/handlers/postback';

const event = {
  type: 'postback',
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
  postback: { data: 'action=save_meal&sid=sid-1' },
};

const state = {
  sid: 'sid-1',
  mode: null,
  pendingMeal: {
    foodName: 'カレー',
    calories: 650,
    macros: { protein: 18, fat: 22, carbs: 92, fiber: null, sugar: null, sodium: 1200, potassium: null },
    mealType: 'lunch',
    timestamp: '2026-07-09T03:00:00.000Z',
    image: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveUserOrReply.mockResolvedValue({ uid: 'uid-1', data: {} });
  mocks.addMealAdmin.mockResolvedValue('meal-1');
  mocks.evaluateSingleMeal.mockResolvedValue({ score: 8, reason: 'いい感じ！' });
});

describe('LINE postback meal confirmation', () => {
  it('saves once and rejects the same sid after state is consumed', async () => {
    mocks.getActiveLineState
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce(null);

    await handlePostbackEvent(event);
    await handlePostbackEvent(event);

    expect(mocks.addMealAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.clearLineState).toHaveBeenCalledTimes(1);
    expect(mocks.replyOrPushMessage).toHaveBeenLastCalledWith(event, EXPIRED_CARD_MESSAGE);
  });

  it('moves the state into correction mode on edit', async () => {
    mocks.getActiveLineState.mockResolvedValue(state);
    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=edit_meal&sid=sid-1' },
    });

    expect(mocks.setLineState).toHaveBeenCalledWith('uid-1', {
      pendingMeal: state.pendingMeal,
      mode: 'awaiting_correction',
      sid: 'sid-1',
    });
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      text: expect.stringContaining('どこを直す'),
    }));
  });
});
