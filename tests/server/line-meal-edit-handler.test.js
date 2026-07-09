import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveMealEditPlan: vi.fn(),
  getRecentMealsAdmin: vi.fn(),
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  resolveUserOrReply: vi.fn(),
  setLineState: vi.fn().mockResolvedValue(undefined),
  createSid: vi.fn(() => 'sid-edit'),
}));

vi.mock('@/app/actions/meal-edit', () => ({
  resolveMealEditPlan: mocks.resolveMealEditPlan,
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  getRecentMealsAdmin: mocks.getRecentMealsAdmin,
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/line/resolveUser', () => ({
  resolveUserOrReply: mocks.resolveUserOrReply,
}));

vi.mock('@/lib/line/state', () => ({
  setLineState: mocks.setLineState,
}));

vi.mock('@/lib/line/mealUtils', () => ({
  createSid: mocks.createSid,
  MEAL_TYPE_LABELS: {
    breakfast: '朝食',
    lunch: '昼食',
    dinner: '夕食',
    snack: '間食',
  },
}));

import { handleMealEditEvent } from '@/lib/line/handlers/meal-edit';

const event = {
  type: 'message',
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
  message: { type: 'text', text: 'さっきのチョコレートを削除して' },
};

const user = { uid: 'uid-1', data: {} };

const meals = [
  { id: 'm1', foodName: 'チョコレート', mealType: 'snack', calories: 145, timestamp: '2026-07-09T06:10:00.000Z' },
  { id: 'm2', foodName: 'カレー', mealType: 'breakfast', calories: 650, timestamp: '2026-07-09T03:20:00.000Z' },
  { id: 'm3', foodName: 'サラダ', mealType: 'breakfast', calories: 120, timestamp: '2026-07-09T03:30:00.000Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSid.mockReturnValue('sid-edit');
  mocks.getRecentMealsAdmin.mockResolvedValue(meals);
  mocks.replyOrPushMessage.mockResolvedValue({ success: true });
  mocks.setLineState.mockResolvedValue(undefined);
});

describe('LINE meal edit handler', () => {
  it('sends a delete confirmation card and stores pendingEdit', async () => {
    mocks.resolveMealEditPlan.mockResolvedValue({
      operation: 'delete',
      mealType: null,
      targetIds: ['m1'],
      confirmText: 'チョコレート(間食/145kcal)を削除',
      notFoundReason: null,
    });

    await handleMealEditEvent(event, user, event.message.text);

    expect(mocks.resolveMealEditPlan).toHaveBeenCalledWith(event.message.text, expect.arrayContaining([
      expect.objectContaining({ id: 'm1', foodName: 'チョコレート', mealType: 'snack', calories: 145 }),
    ]));
    expect(mocks.setLineState).toHaveBeenCalledWith('uid-1', {
      pendingEdit: {
        operation: 'delete',
        mealType: null,
        targetIds: ['m1'],
        targetNames: ['チョコレート（間食/145kcal）'],
      },
      mode: 'awaiting_edit_confirm',
      sid: 'sid-edit',
    });
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(event, expect.objectContaining({
      type: 'flex',
      altText: '食事記録を削除する？',
    }));
  });

  it('sends a change_type confirmation card for multiple targets', async () => {
    mocks.resolveMealEditPlan.mockResolvedValue({
      operation: 'change_type',
      mealType: 'lunch',
      targetIds: ['m2', 'm3'],
      confirmText: '朝食2件を昼食に変更',
      notFoundReason: null,
    });

    await handleMealEditEvent({ ...event, message: { type: 'text', text: '今日の朝食を全部昼食にして' } }, user, '今日の朝食を全部昼食にして');

    expect(mocks.setLineState).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      pendingEdit: {
        operation: 'change_type',
        mealType: 'lunch',
        targetIds: ['m2', 'm3'],
        targetNames: ['カレー（朝食/650kcal）', 'サラダ（朝食/120kcal）'],
      },
    }));
    const flex = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(flex.altText).toBe('食事記録を変更する？');
    expect(flex.contents.body.contents[0].text).toContain('朝食2件を昼食に変更');
  });

  it('replies with notFoundReason without state changes', async () => {
    mocks.resolveMealEditPlan.mockResolvedValue({
      operation: 'none',
      mealType: null,
      targetIds: [],
      confirmText: '',
      notFoundReason: 'その記録は見つからなかったよ😢',
    });

    await handleMealEditEvent(event, user, event.message.text);

    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(event, {
      type: 'text',
      text: 'その記録は見つからなかったよ😢',
    });
    expect(mocks.setLineState).not.toHaveBeenCalled();
  });

  it('drops hallucinated ids before storing the edit plan', async () => {
    mocks.resolveMealEditPlan.mockResolvedValue({
      operation: 'delete',
      mealType: null,
      targetIds: ['m1', 'ghost-id'],
      confirmText: 'チョコレートを削除',
      notFoundReason: null,
    });

    await handleMealEditEvent(event, user, event.message.text);

    expect(mocks.setLineState).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      pendingEdit: expect.objectContaining({
        targetIds: ['m1'],
        targetNames: ['チョコレート（間食/145kcal）'],
      }),
    }));
  });
});
