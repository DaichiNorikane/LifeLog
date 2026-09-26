import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addMealAdmin: vi.fn().mockResolvedValue('meal-1'),
  deleteMealsAdmin: vi.fn().mockResolvedValue(1),
  updateMealsTypeAdmin: vi.fn().mockResolvedValue(1),
  getLineChatContextAdmin: vi.fn().mockResolvedValue({
    today: { meals: [], totalCalories: 1000 },
    user: { targetCalories: 2000 },
    messageHistory: [{ role: 'user', text: 'カップヌードルが食べたい' }],
  }),
  saveLineChatExchangeAdmin: vi.fn().mockResolvedValue(undefined),
  evaluateSingleMeal: vi.fn().mockResolvedValue({ score: 8, reason: 'いい感じ！' }),
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  resolveUserOrReply: vi.fn().mockResolvedValue({ uid: 'uid-1', data: {} }),
  clearLineState: vi.fn().mockResolvedValue(undefined),
  getLineStateBySid: vi.fn(),
  setLineState: vi.fn().mockResolvedValue(undefined),
  handleRecipesEvent: vi.fn().mockResolvedValue({}),
  handleRecipeCategoriesEvent: vi.fn().mockResolvedValue({}),
  handleLogRecipe: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/app/actions/daily-evaluation', () => ({
  evaluateSingleMeal: mocks.evaluateSingleMeal,
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  addMealAdmin: mocks.addMealAdmin,
  deleteMealsAdmin: mocks.deleteMealsAdmin,
  updateMealsTypeAdmin: mocks.updateMealsTypeAdmin,
  getLineChatContextAdmin: mocks.getLineChatContextAdmin,
  saveLineChatExchangeAdmin: mocks.saveLineChatExchangeAdmin,
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/line/resolveUser', () => ({
  resolveUserOrReply: mocks.resolveUserOrReply,
}));

vi.mock('@/lib/line/state', () => ({
  clearLineState: mocks.clearLineState,
  getLineStateBySid: mocks.getLineStateBySid,
  setLineState: mocks.setLineState,
}));

// postback.js から動的 import されるレシピハンドラ
vi.mock('@/lib/line/handlers/recipes', () => ({
  handleRecipesEvent: mocks.handleRecipesEvent,
  handleRecipeCategoriesEvent: mocks.handleRecipeCategoriesEvent,
  handleLogRecipe: mocks.handleLogRecipe,
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
    mocks.getLineStateBySid
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce(null);

    await handlePostbackEvent(event);
    await handlePostbackEvent(event);

    expect(mocks.addMealAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.clearLineState).toHaveBeenCalledTimes(1);
    expect(mocks.clearLineState).toHaveBeenCalledWith('uid-1', 'sid-1');
    expect(mocks.replyOrPushMessage).toHaveBeenLastCalledWith(event, EXPIRED_CARD_MESSAGE);
  });

  it('moves the state into correction mode on edit', async () => {
    mocks.getLineStateBySid.mockResolvedValue(state);
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
      text: expect.stringContaining('どこを直しますか'),
    }));
  });

  it('saves directly with the tapped meal type', async () => {
    mocks.getLineStateBySid.mockResolvedValue(state);

    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=save_meal&sid=sid-1&type=dinner' },
    });

    expect(mocks.addMealAdmin).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      foodName: 'カレー',
      mealType: 'dinner',
    }));
    expect(mocks.clearLineState).toHaveBeenCalledTimes(1);
    const flex = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(flex.type).toBe('flex');
    expect(JSON.stringify(flex)).toContain('現在1000kcal / 2000kcal');
  });

  it('passes chat history to the evaluation and records the exchange', async () => {
    mocks.getLineStateBySid.mockResolvedValue(state);

    await handlePostbackEvent(event);

    expect(mocks.evaluateSingleMeal).toHaveBeenCalledWith(
      expect.objectContaining({ foodName: 'カレー', id: 'meal-1' }),
      [],
      { messageHistory: [{ role: 'user', text: 'カップヌードルが食べたい' }] },
    );
    expect(mocks.saveLineChatExchangeAdmin).toHaveBeenCalledWith(
      'uid-1',
      '（食事を記録: カレー 650kcal / 昼食）',
      'いい感じ！\n\n現在1000kcal / 2000kcal',
    );
  });

  it('handles legacy set_type postbacks by saving with that type', async () => {
    mocks.getLineStateBySid.mockResolvedValue(state);

    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=set_type&sid=sid-1&type=snack' },
    });

    expect(mocks.addMealAdmin).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      mealType: 'snack',
    }));
  });

  it('applies a pending delete edit', async () => {
    mocks.getLineStateBySid.mockResolvedValue(editState);

    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=apply_edit&sid=sid-edit' },
    });

    expect(mocks.deleteMealsAdmin).toHaveBeenCalledWith('uid-1', ['meal-1']);
    expect(mocks.updateMealsTypeAdmin).not.toHaveBeenCalled();
    expect(mocks.clearLineState).toHaveBeenCalledTimes(1);
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      text: expect.stringContaining('消しておきました'),
    }));
  });

  it('applies a pending change_type edit', async () => {
    mocks.getLineStateBySid.mockResolvedValue({
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
      text: expect.stringContaining('昼食に変えました'),
    }));
  });

  it('cancels a pending edit', async () => {
    mocks.getLineStateBySid.mockResolvedValue(editState);

    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=cancel_edit&sid=sid-edit' },
    });

    expect(mocks.clearLineState).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMealsAdmin).not.toHaveBeenCalled();
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.any(Object), {
      type: 'text',
      text: 'そのままにしておきますね👌',
    });
  });

  it('rejects expired edit cards', async () => {
    mocks.getLineStateBySid.mockResolvedValue(null);

    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=apply_edit&sid=sid-edit' },
    });

    expect(mocks.deleteMealsAdmin).not.toHaveBeenCalled();
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.any(Object), EXPIRED_CARD_MESSAGE);
  });
});

describe('LINE postback recipe actions', () => {
  it('dispatches action=recipes with offset and category', async () => {
    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=recipes&offset=11&cat=main' },
    });

    expect(mocks.handleRecipesEvent).toHaveBeenCalledWith(
      expect.any(Object), { uid: 'uid-1', data: {} }, { offset: '11', category: 'main' },
    );
  });

  it('dispatches action=recipe_cats to the category picker', async () => {
    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=recipe_cats' },
    });

    expect(mocks.handleRecipeCategoriesEvent).toHaveBeenCalledWith(
      expect.any(Object), { uid: 'uid-1', data: {} },
    );
  });

  it('dispatches action=log_recipe with the recipe id and type', async () => {
    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=log_recipe&rid=r1&type=lunch' },
    });

    expect(mocks.handleLogRecipe).toHaveBeenCalledWith(
      expect.any(Object), { uid: 'uid-1', data: {} }, 'r1', 'lunch',
    );
  });

  it('replies casually on cancel_recipe without touching state', async () => {
    await handlePostbackEvent({
      ...event,
      postback: { data: 'action=cancel_recipe' },
    });

    expect(mocks.clearLineState).not.toHaveBeenCalled();
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      text: expect.stringContaining('レシピ'),
    }));
  });
});

describe('LINE postback grouped meals (複数写真のまとめカード)', () => {
  const setState = {
    sid: 'sid-set',
    mode: null,
    pendingMeal: null,
    pendingMeals: [
      { foodName: 'ハンバーグ', calories: 500, macros: { protein: 25, fat: 30, carbs: 20, fiber: null, sodium: 900 }, mealType: 'dinner' },
      { foodName: 'ライス', calories: 250, macros: { protein: 4, fat: 0.5, carbs: 55, fiber: 0.5, sodium: null }, mealType: 'dinner' },
    ],
  };
  const setEvent = (data) => ({ ...event, postback: { data } });

  it('saves every item with the tapped type and evaluates them once as a whole', async () => {
    mocks.getLineStateBySid.mockResolvedValue(setState);
    mocks.addMealAdmin.mockResolvedValueOnce('meal-a').mockResolvedValueOnce('meal-b');
    mocks.getLineChatContextAdmin.mockResolvedValueOnce({
      today: {
        meals: [
          { id: 'meal-a', foodName: 'ハンバーグ', calories: 500, mealType: 'lunch' },
          { id: 'meal-b', foodName: 'ライス', calories: 250, mealType: 'lunch' },
          { id: 'meal-x', foodName: 'サラダ', calories: 80, mealType: 'lunch' },
        ],
        totalCalories: 830,
      },
      user: { targetCalories: 2000 },
      messageHistory: [],
    });

    await handlePostbackEvent(setEvent('action=save_meals&sid=sid-set&type=lunch'));

    expect(mocks.addMealAdmin).toHaveBeenCalledTimes(2);
    expect(mocks.addMealAdmin.mock.calls.map(call => call[1].mealType)).toEqual(['lunch', 'lunch']);
    expect(mocks.clearLineState).toHaveBeenCalledWith('uid-1', 'sid-set');

    // 1品ずつではなく、合計した1回の食事として1度だけ評価する
    expect(mocks.evaluateSingleMeal).toHaveBeenCalledTimes(1);
    const [combined, otherMeals, options] = mocks.evaluateSingleMeal.mock.calls[0];
    expect(combined).toMatchObject({ foodName: 'ハンバーグ、ライス', calories: 750, mealType: 'lunch' });
    expect(combined.macros.protein).toBe(29);
    expect(combined.macros.fiber).toBe(0.5);   // 推定できた品だけ合計
    expect(combined.macros.sodium).toBe(900);
    // 今回保存した分は二重計上しない
    expect(otherMeals.map(meal => meal.id)).toEqual(['meal-x']);
    expect(options.items).toHaveLength(2);

    const message = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(JSON.stringify(message)).toContain('昼食に2品記録しました');
    expect(JSON.stringify(message)).toContain('合計 750 kcal');
  });

  it('restores the card when nothing could be saved', async () => {
    mocks.getLineStateBySid.mockResolvedValue(setState);
    mocks.addMealAdmin.mockRejectedValueOnce(new Error('down'));

    await handlePostbackEvent(setEvent('action=save_meals&sid=sid-set&type=dinner'));

    expect(mocks.setLineState).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      sid: 'sid-set', pendingMeals: setState.pendingMeals,
    }));
    expect(mocks.replyOrPushMessage.mock.calls[0][1].text).toContain('保存に失敗');
    expect(mocks.evaluateSingleMeal).not.toHaveBeenCalled();
  });

  it('splits the grouped card into individual confirm cards', async () => {
    mocks.getLineStateBySid.mockResolvedValue(setState);

    await handlePostbackEvent(setEvent('action=split_meals&sid=sid-set'));

    expect(mocks.setLineState).toHaveBeenCalledTimes(2);
    expect(mocks.setLineState.mock.calls.map(call => call[1].pendingMeal.foodName)).toEqual(['ハンバーグ', 'ライス']);
    expect(mocks.clearLineState).toHaveBeenCalledWith('uid-1', 'sid-set');
    const [message] = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(message.contents.type).toBe('carousel');
    expect(message.contents.contents).toHaveLength(2);
    expect(mocks.addMealAdmin).not.toHaveBeenCalled();
  });

  it('cancels a grouped card', async () => {
    mocks.getLineStateBySid.mockResolvedValue(setState);

    await handlePostbackEvent(setEvent('action=cancel_meal&sid=sid-set'));

    expect(mocks.clearLineState).toHaveBeenCalledWith('uid-1', 'sid-set');
    expect(mocks.addMealAdmin).not.toHaveBeenCalled();
  });

  it('rejects single-meal actions on a grouped card', async () => {
    mocks.getLineStateBySid.mockResolvedValue(setState);

    await handlePostbackEvent(setEvent('action=save_meal&sid=sid-set&type=lunch'));

    expect(mocks.addMealAdmin).not.toHaveBeenCalled();
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.anything(), EXPIRED_CARD_MESSAGE);
  });
});
