import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyzeImageWithGemini: vi.fn(),
  getMessageContentBase64: vi.fn().mockResolvedValue('data:image/jpeg;base64,abc'),
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  resolveUserOrReply: vi.fn().mockResolvedValue({ uid: 'uid-1', data: {} }),
  getAwaitingPhotoContextState: vi.fn().mockResolvedValue(null),
  clearLineState: vi.fn().mockResolvedValue(undefined),
  setLineState: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/app/actions/image-analysis', () => ({
  analyzeImageWithGemini: mocks.analyzeImageWithGemini,
}));

vi.mock('@/lib/line/client', () => ({
  getMessageContentBase64: mocks.getMessageContentBase64,
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/line/resolveUser', () => ({
  resolveUserOrReply: mocks.resolveUserOrReply,
}));

vi.mock('@/lib/line/state', () => ({
  getAwaitingPhotoContextState: mocks.getAwaitingPhotoContextState,
  clearLineState: mocks.clearLineState,
  setLineState: mocks.setLineState,
}));

import { handleMealPhotoEvent, handlePhotoContextStash } from '@/lib/line/handlers/meal-photo';
import { parseMealTypeHint } from '@/lib/line/mealUtils';

const event = {
  type: 'message',
  message: { id: 'img-1', type: 'image' },
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
};

const analysis = {
  foodName: '焼き魚定食',
  calories: 560,
  macros: { protein: 32, fat: 14, carbs: 70 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.analyzeImageWithGemini.mockResolvedValue(analysis);
  mocks.getMessageContentBase64.mockResolvedValue('data:image/jpeg;base64,abc');
  mocks.resolveUserOrReply.mockResolvedValue({ uid: 'uid-1', data: {} });
  mocks.getAwaitingPhotoContextState.mockResolvedValue(null);
});

describe('parseMealTypeHint', () => {
  it.each([
    ['これを昼に食べた', 'lunch'],
    ['朝ごはんはこれ', 'breakfast'],
    ['昨日の夜に食べた', 'dinner'],
    ['ランチで半分残した', 'lunch'],
    ['おやつに食べた', 'snack'],
  ])('%s → %s', (text, expected) => {
    expect(parseMealTypeHint(text)).toBe(expected);
  });

  it('returns null when the text has no meal-type words', () => {
    expect(parseMealTypeHint('半分残した')).toBeNull();
    expect(parseMealTypeHint('')).toBeNull();
    expect(parseMealTypeHint(null)).toBeNull();
  });
});

describe('handleMealPhotoEvent with stashed context', () => {
  it('merges the stashed text into the analysis and consumes it', async () => {
    mocks.getAwaitingPhotoContextState.mockResolvedValue({
      sid: 'photo-context-1', mode: 'awaiting_photo_context', contextText: 'これを昼に食べた。米は玄米に変更',
    });

    const result = await handleMealPhotoEvent(event);

    // 補足テキストがそのままGeminiに渡る
    expect(mocks.analyzeImageWithGemini).toHaveBeenCalledWith(
      'data:image/jpeg;base64,abc', 'これを昼に食べた。米は玄米に変更',
    );
    // 使った補足は消す（次の無関係な写真に付かないように）
    expect(mocks.clearLineState).toHaveBeenCalledWith('uid-1', 'photo-context-1');
    // 「昼」から食事タイプが選ばれる
    expect(result.mealType).toBe('lunch');
    expect(mocks.setLineState).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      pendingMeal: expect.objectContaining({ mealType: 'lunch', foodName: '焼き魚定食' }),
    }));
  });

  it('analyzes without context when nothing is stashed', async () => {
    await handleMealPhotoEvent(event);

    expect(mocks.analyzeImageWithGemini).toHaveBeenCalledWith('data:image/jpeg;base64,abc', '');
    expect(mocks.clearLineState).not.toHaveBeenCalled();
    // 確認カードは従来どおり返る
    const message = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(message.type).toBe('flex');
    expect(JSON.stringify(message)).toContain('焼き魚定食');
  });

  it('falls back to the friendly error message when analysis fails', async () => {
    mocks.analyzeImageWithGemini.mockResolvedValue({ error: 'boom' });

    await handleMealPhotoEvent(event);

    const message = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(message.type).toBe('text');
    expect(message.text).toContain('解析に失敗');
  });
});

describe('handlePhotoContextStash', () => {
  it('stores the text for the next photo and confirms to the user', async () => {
    const result = await handlePhotoContextStash(event, { uid: 'uid-1' }, 'これを昼に食べた');

    expect(result.stashed).toBe(true);
    expect(mocks.setLineState).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      mode: 'awaiting_photo_context',
      contextText: 'これを昼に食べた',
    }));
    const message = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(message.text).toContain('写真');
  });
});
