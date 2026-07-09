import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addMealAdmin: vi.fn().mockResolvedValue('meal-1'),
  deleteMealsAdmin: vi.fn().mockResolvedValue(1),
  updateMealsTypeAdmin: vi.fn().mockResolvedValue(1),
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
  deleteMealsAdmin: mocks.deleteMealsAdmin,
  updateMealsTypeAdmin: mocks.updateMealsTypeAdmin,
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

const editState = {
  sid: 'sid-edit',
  mode: 'awaiting_edit_confirm',
  pendingEdit: {
    operation: 'delete',
    mealType: null,
    targetIds: ['meal-1'],
    targetNames: ['チョコレート（間食/145kcal）'],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveUserOrReply.mockResolvedValue({ uid: 'uid-1', data: {} });
  mocks.addMealAdmin.mockResolvedValue('meal-1');
  mocks.deleteMealsAdmin.mockResolvedValue(1);
  mocks.updateMealsTypeAdmin.mockResolvedValue(1);
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

  it('updates pending meal type and resends the confirmation card', async () => {
    mocks.getActiveLineState.mockResolvedValue(state);

    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=set_type&sid=sid-1&type=dinner' },
    });

    expect(mocks.setLineState).toHaveBeenCalledWith('uid-1', {
      pendingMeal: {
        ...state.pendingMeal,
        mealType: 'dinner',
      },
      mode: state.mode,
      sid: 'sid-1',
    });
    const flex = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(flex.type).toBe('flex');
    expect(flex.contents.footer.contents[0].contents[2].style).toBe('primary');
  });

  it('applies a pending delete edit', async () => {
    mocks.getActiveLineState.mockResolvedValue(editState);

    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=apply_edit&sid=sid-edit' },
    });

    expect(mocks.deleteMealsAdmin).toHaveBeenCalledWith('uid-1', ['meal-1']);
    expect(mocks.updateMealsTypeAdmin).not.toHaveBeenCalled();
    expect(mocks.clearLineState).toHaveBeenCalledTimes(1);
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      text: expect.stringContaining('消しといた'),
    }));
  });

  it('applies a pending change_type edit', async () => {
    mocks.getActiveLineState.mockResolvedValue({
      ...editState,
      pendingEdit: {
        operation: 'change_type',
        mealType: 'lunch',
        targetIds: ['meal-1', 'meal-2'],
        targetNames: ['カレー（朝食/650kcal）', 'サラダ（朝食/120kcal）'],
      },
    });

    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=apply_edit&sid=sid-edit' },
    });

    expect(mocks.updateMealsTypeAdmin).toHaveBeenCalledWith('uid-1', ['meal-1', 'meal-2'], 'lunch');
    expect(mocks.deleteMealsAdmin).not.toHaveBeenCalled();
    expect(mocks.clearLineState).toHaveBeenCalledTimes(1);
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      text: expect.stringContaining('昼食に変えた'),
    }));
  });

  it('cancels a pending edit', async () => {
    mocks.getActiveLineState.mockResolvedValue(editState);

    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=cancel_edit&sid=sid-edit' },
    });

    expect(mocks.clearLineState).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMealsAdmin).not.toHaveBeenCalled();
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.any(Object), {
      type: 'text',
      text: 'そのままにしておくね👌',
    });
  });

  it('rejects expired edit cards', async () => {
    mocks.getActiveLineState.mockResolvedValue(null);

    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=apply_edit&sid=sid-edit' },
    });

    expect(mocks.deleteMealsAdmin).not.toHaveBeenCalled();
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.any(Object), EXPIRED_CARD_MESSAGE);
  });
});
