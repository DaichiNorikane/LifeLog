import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const webhookCreate = vi.fn().mockResolvedValue(undefined);
  return {
    webhookCreate,
    showLoadingAnimation: vi.fn().mockResolvedValue({ success: true }),
    replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
    handleChatEvent: vi.fn(),
    handleDailySummaryEvent: vi.fn(),
    handleFollowEvent: vi.fn(),
    handleLinkCodeEvent: vi.fn(),
    handleKeywordSuggestEvent: vi.fn(),
    handleMealEditEvent: vi.fn(),
    handleMealCorrectionEvent: vi.fn(),
    handleMealTextEvent: vi.fn(),
    handleMealPhotoEvent: vi.fn(),
    handlePostbackEvent: vi.fn(),
    handleWeightEvent: vi.fn(),
    handleGoalEvent: vi.fn(),
    handleBodyEvent: vi.fn(),
    handleRecentMealsEvent: vi.fn(),
    resolveUserOrReply: vi.fn().mockResolvedValue({ uid: 'uid-1', data: {} }),
    getAwaitingCorrectionState: vi.fn().mockResolvedValue(null),
    classifyLineIntent: vi.fn().mockResolvedValue({ intent: 'other', mealDescription: null }),
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: vi.fn((name) => {
      if (name === 'webhookEvents') {
        return { doc: vi.fn(() => ({ create: mocks.webhookCreate })) };
      }
      return {};
    }),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: vi.fn(() => 'server-timestamp') },
}));

vi.mock('@/lib/line/client', () => ({
  showLoadingAnimation: mocks.showLoadingAnimation,
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/line/handlers/chat', () => ({
  handleChatEvent: mocks.handleChatEvent,
}));

vi.mock('@/lib/line/handlers/daily-summary', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    handleDailySummaryEvent: mocks.handleDailySummaryEvent,
  };
});

vi.mock('@/lib/line/handlers/link', () => ({
  handleFollowEvent: mocks.handleFollowEvent,
  handleLinkCodeEvent: mocks.handleLinkCodeEvent,
}));

vi.mock('@/lib/line/handlers/keyword-suggest', () => ({
  MEAL_KEYWORDS: { '朝食': 'breakfast', '昼食': 'lunch', '夕食': 'dinner' },
  handleKeywordSuggestEvent: mocks.handleKeywordSuggestEvent,
}));

vi.mock('@/lib/line/handlers/meal-edit', () => ({
  handleMealEditEvent: mocks.handleMealEditEvent,
}));

vi.mock('@/lib/line/handlers/meal-text', () => ({
  handleMealCorrectionEvent: mocks.handleMealCorrectionEvent,
  handleMealTextEvent: mocks.handleMealTextEvent,
}));

vi.mock('@/lib/line/handlers/meal-photo', () => ({
  handleMealPhotoEvent: mocks.handleMealPhotoEvent,
}));

vi.mock('@/lib/line/handlers/postback', () => ({
  handlePostbackEvent: mocks.handlePostbackEvent,
}));

vi.mock('@/lib/line/handlers/weight', () => ({
  parseWeightText: (text) => {
    const trimmed = String(text || '').trim();
    if (!/^(体重)?\s*\d{2,3}(\.\d+)?\s*(kg)?$/.test(trimmed)) return null;
    const weight = Number(trimmed.match(/\d{2,3}(?:\.\d+)?/)?.[0]);
    return weight >= 20 && weight <= 200 ? weight : null;
  },
  handleWeightEvent: mocks.handleWeightEvent,
}));

vi.mock('@/lib/line/handlers/recent-meals', async () => {
  const actual = await vi.importActual('@/lib/line/handlers/recent-meals');
  return { ...actual, handleRecentMealsEvent: mocks.handleRecentMealsEvent };
});

vi.mock('@/lib/line/handlers/body', async () => {
  const actual = await vi.importActual('@/lib/line/handlers/body');
  return { ...actual, handleBodyEvent: mocks.handleBodyEvent };
});

vi.mock('@/lib/line/handlers/goal', async () => {
  // parseGoalCommand は本物を使い、送信だけモックする（ルーティング判定そのものを検証したいため）
  const actual = await vi.importActual('@/lib/line/handlers/goal');
  return { ...actual, handleGoalEvent: mocks.handleGoalEvent };
});

vi.mock('@/lib/line/resolveUser', () => ({
  resolveUserOrReply: mocks.resolveUserOrReply,
}));

vi.mock('@/lib/line/state', () => ({
  getAwaitingCorrectionState: mocks.getAwaitingCorrectionState,
}));

vi.mock('@/app/actions/line-intent', () => ({
  classifyLineIntent: mocks.classifyLineIntent,
}));

import { classifyEventRoute, classifyTextRoute, handleLineEvent, handleLineEvents } from '@/lib/line/router';

const textEvent = (text, extra = {}) => ({
  type: 'message',
  webhookEventId: `evt-${text}`,
  message: { id: `msg-${text}`, type: 'text', text },
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.webhookCreate.mockResolvedValue(undefined);
  mocks.resolveUserOrReply.mockResolvedValue({ uid: 'uid-1', data: {} });
  mocks.getAwaitingCorrectionState.mockResolvedValue(null);
  mocks.classifyLineIntent.mockResolvedValue({ intent: 'other', mealDescription: null });
});

describe('LINE router dispatch', () => {
  it('routes postback events first', async () => {
    const event = { type: 'postback', webhookEventId: 'evt-postback', postback: { data: 'action=save_meal&sid=sid' }, source: { userId: 'line-user-1' }, replyToken: 'r' };
    expect(classifyEventRoute(event)).toEqual({ type: 'postback' });
    await handleLineEvent(event);
    expect(mocks.handlePostbackEvent).toHaveBeenCalledWith(event);
  });

  it('routes image messages to the photo handler', async () => {
    const event = { type: 'message', webhookEventId: 'evt-img', message: { id: 'img-1', type: 'image' }, source: { userId: 'line-user-1' }, replyToken: 'r' };
    expect(classifyEventRoute(event)).toEqual({ type: 'image' });
    await handleLineEvent(event);
    expect(mocks.handleMealPhotoEvent).toHaveBeenCalledWith(event);
  });

  it('routes valid weight text before intent classification', async () => {
    const event = textEvent('体重65.2kg');
    expect(classifyTextRoute('65.2')).toEqual({ type: 'weight', weight: 65.2 });
    await handleLineEvent(event);
    expect(mocks.handleWeightEvent).toHaveBeenCalledWith(event, '体重65.2kg');
    expect(mocks.classifyLineIntent).not.toHaveBeenCalled();
  });

  it('routes history requests to the recent meals handler', async () => {
    expect(classifyTextRoute('履歴')).toEqual({ type: 'recent_meals' });
    expect(classifyTextRoute('いつもの')).toEqual({ type: 'recent_meals' });

    const event = textEvent('履歴');
    await handleLineEvent(event);
    expect(mocks.handleRecentMealsEvent).toHaveBeenCalledWith(event, { uid: 'uid-1', data: {} });
    expect(mocks.classifyLineIntent).not.toHaveBeenCalled();
  });

  it('routes body questions to the body handler', async () => {
    expect(classifyTextRoute('からだ')).toEqual({ type: 'body' });
    expect(classifyTextRoute('体調')).toEqual({ type: 'body' });
    // 食事の記録には誤爆しない
    expect(classifyTextRoute('からあげ食べた')).toEqual({ type: 'intent' });

    const event = textEvent('からだ');
    await handleLineEvent(event);
    expect(mocks.handleBodyEvent).toHaveBeenCalledWith(event, { uid: 'uid-1', data: {} });
    expect(mocks.classifyLineIntent).not.toHaveBeenCalled();
  });

  it('routes goal commands to the goal handler', async () => {
    expect(classifyTextRoute('目標')).toEqual({ type: 'goal', goal: { action: 'show' } });
    expect(classifyTextRoute('目標カロリー 1800')).toEqual({
      type: 'goal', goal: { action: 'set', patch: { targetCalories: 1800 } },
    });

    const event = textEvent('目標カロリー 1800');
    await handleLineEvent(event);
    expect(mocks.handleGoalEvent).toHaveBeenCalledWith(
      event, { uid: 'uid-1', data: {} }, { action: 'set', patch: { targetCalories: 1800 } },
    );
    expect(mocks.classifyLineIntent).not.toHaveBeenCalled();
  });

  it('does not mistake a target weight command for a weight log', async () => {
    // 「目標体重 75」は体重の記録ではなく目標の変更
    expect(classifyTextRoute('目標体重 75')).toEqual({
      type: 'goal', goal: { action: 'set', patch: { targetWeight: 75 } },
    });

    await handleLineEvent(textEvent('目標体重 75'));
    expect(mocks.handleWeightEvent).not.toHaveBeenCalled();
    expect(mocks.handleGoalEvent).toHaveBeenCalled();
  });

  it('routes 6-digit link codes before user resolution', async () => {
    const event = textEvent('123456');
    expect(classifyTextRoute('123456')).toEqual({ type: 'link_code', code: '123456' });
    await handleLineEvent(event);
    expect(mocks.handleLinkCodeEvent).toHaveBeenCalledWith(event, '123456');
    expect(mocks.resolveUserOrReply).not.toHaveBeenCalled();
  });

  it('routes meal keywords to the existing suggestion handler', async () => {
    const event = textEvent('朝食');
    expect(classifyTextRoute('朝食')).toEqual({ type: 'keyword', targetType: 'breakfast' });
    await handleLineEvent(event);
    expect(mocks.handleKeywordSuggestEvent).toHaveBeenCalledWith(event, 'breakfast');
  });

  it('routes summary keywords to the daily summary handler', async () => {
    expect(classifyTextRoute('サマリー')).toEqual({ type: 'summary' });
    expect(classifyTextRoute('今日のカロリー')).toEqual({ type: 'summary' });
    expect(classifyTextRoute('今日の栄養は？')).toEqual({ type: 'summary' });
    expect(classifyTextRoute('グラフ')).toEqual({ type: 'summary' });
    // 食事記録の発話には誤爆しない
    expect(classifyTextRoute('カロリーメイト食べた')).toEqual({ type: 'intent' });

    const event = textEvent('サマリー');
    await handleLineEvent(event);
    expect(mocks.handleDailySummaryEvent).toHaveBeenCalledWith(event, { uid: 'uid-1', data: {} });
    expect(mocks.classifyLineIntent).not.toHaveBeenCalled();
  });

  it('routes awaiting correction state before Gemini intent classification', async () => {
    const event = textEvent('ご飯半分');
    const state = { mode: 'awaiting_correction', pendingMeal: { foodName: 'カレー' }, sid: 'sid-1' };
    mocks.getAwaitingCorrectionState.mockResolvedValue(state);

    await handleLineEvent(event);
    expect(mocks.handleMealCorrectionEvent).toHaveBeenCalledWith(event, { uid: 'uid-1', data: {} }, state, 'ご飯半分');
    expect(mocks.classifyLineIntent).not.toHaveBeenCalled();
  });

  it('routes other text to the Elena chat handler', async () => {
    const event = textEvent('こんにちは');
    await handleLineEvent(event);
    expect(mocks.handleChatEvent).toHaveBeenCalledWith(event, { uid: 'uid-1', data: {} }, 'こんにちは');
  });

  it('routes log_meal intent to text meal estimation', async () => {
    const event = textEvent('サラダチキンとおにぎり食べた');
    mocks.classifyLineIntent.mockResolvedValue({ intent: 'log_meal', mealDescription: 'サラダチキンとおにぎり' });

    await handleLineEvent(event);
    expect(mocks.handleMealTextEvent).toHaveBeenCalledWith(event, { uid: 'uid-1', data: {} }, 'サラダチキンとおにぎり');
  });

  it('routes edit_record intent to meal edit handling', async () => {
    const event = textEvent('さっきのチョコレートを削除して');
    mocks.classifyLineIntent.mockResolvedValue({ intent: 'edit_record', mealDescription: null });

    await handleLineEvent(event);

    expect(mocks.handleMealEditEvent).toHaveBeenCalledWith(event, { uid: 'uid-1', data: {} }, 'さっきのチョコレートを削除して');
    expect(mocks.handleChatEvent).not.toHaveBeenCalled();
  });

  it('skips duplicate webhook events', async () => {
    const event = textEvent('こんにちは');
    mocks.webhookCreate.mockRejectedValueOnce(Object.assign(new Error('Already exists'), { code: 'already-exists' }));

    const result = await handleLineEvent(event);
    expect(result).toEqual({ skipped: true, reason: 'duplicate' });
    expect(mocks.showLoadingAnimation).not.toHaveBeenCalled();
  });

  it('processes multiple events in parallel (multi-photo send)', async () => {
    const events = [
      { type: 'message', webhookEventId: 'evt-img-1', message: { id: 'img-1', type: 'image' }, source: { userId: 'line-user-1' }, replyToken: 'r1' },
      { type: 'message', webhookEventId: 'evt-img-2', message: { id: 'img-2', type: 'image' }, source: { userId: 'line-user-1' }, replyToken: 'r2' },
      textEvent('唐揚げ定食食べた'),
    ];
    mocks.classifyLineIntent.mockResolvedValue({ intent: 'log_meal', mealDescription: '唐揚げ定食' });

    const results = await handleLineEvents(events);

    expect(results).toHaveLength(3);
    expect(mocks.handleMealPhotoEvent).toHaveBeenCalledTimes(2);
    expect(mocks.handleMealTextEvent).toHaveBeenCalledTimes(1);
  });

  it('isolates a failing event so the others still succeed', async () => {
    const events = [
      { type: 'message', webhookEventId: 'evt-img-a', message: { id: 'img-a', type: 'image' }, source: { userId: 'line-user-1' }, replyToken: 'r1' },
      { type: 'message', webhookEventId: 'evt-img-b', message: { id: 'img-b', type: 'image' }, source: { userId: 'line-user-1' }, replyToken: 'r2' },
    ];
    mocks.handleMealPhotoEvent
      .mockRejectedValueOnce(new Error('analysis blew up'))
      .mockResolvedValueOnce(undefined);

    const results = await handleLineEvents(events);

    expect(results).toHaveLength(2);
    expect(results.filter(r => r?.error)).toHaveLength(1);
    expect(mocks.handleMealPhotoEvent).toHaveBeenCalledTimes(2);
  });
});
