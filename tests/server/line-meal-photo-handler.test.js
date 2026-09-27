import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyzeImageWithGemini: vi.fn(),
  getMessageContentBase64: vi.fn().mockResolvedValue('data:image/jpeg;base64,abc'),
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  resolveUserOrReply: vi.fn().mockResolvedValue({ uid: 'uid-1', data: {} }),
  getAwaitingPhotoContextState: vi.fn().mockResolvedValue(null),
  clearLineState: vi.fn().mockResolvedValue(undefined),
  setLineState: vi.fn().mockResolvedValue({}),
  addPhotoSetItem: vi.fn(),
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
  addPhotoSetItem: mocks.addPhotoSetItem,
}));

import { getImageSet, handleMealPhotoEvent, handlePhotoContextStash } from '@/lib/line/handlers/meal-photo';
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

describe('複数枚まとめて送られた写真（imageSet）', () => {
  const setEvent = (index) => ({
    ...event,
    message: { id: `img-${index}`, type: 'image', imageSet: { id: 'set-1', index, total: 2 } },
  });

  it('treats a single image or a set of one as a normal photo', () => {
    expect(getImageSet(event)).toBeNull();
    expect(getImageSet({ message: { imageSet: { id: 's', index: 1, total: 1 } } })).toBeNull();
    expect(getImageSet(setEvent(0))).toEqual({ setId: 'set-1', index: 0, total: 2 });
  });

  it('does not reply until every photo in the set is analyzed', async () => {
    mocks.addPhotoSetItem.mockResolvedValue({ complete: false, meals: [] });

    const result = await handleMealPhotoEvent(setEvent(0));

    expect(result.waiting).toBe(true);
    expect(mocks.addPhotoSetItem).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      setId: 'set-1', index: 0, total: 2, meal: expect.objectContaining({ foodName: '焼き魚定食' }),
    }));
    expect(mocks.replyOrPushMessage).not.toHaveBeenCalled();
    expect(mocks.setLineState).not.toHaveBeenCalled();
  });

  it('replies with one grouped confirm card when the last photo arrives', async () => {
    mocks.getAwaitingPhotoContextState.mockResolvedValue({
      sid: 'photo-context-1', mode: 'awaiting_photo_context', contextText: '夜に食べた',
    });
    mocks.addPhotoSetItem.mockResolvedValue({
      complete: true,
      meals: [
        { foodName: '焼き魚定食', calories: 560, macros: { protein: 32, fat: 14, carbs: 70 }, mealType: 'dinner' },
        { foodName: '味噌汁', calories: 60, macros: { protein: 4, fat: 2, carbs: 6 }, mealType: 'lunch' },
      ],
    });

    const result = await handleMealPhotoEvent(setEvent(1));

    expect(result.count).toBe(2);
    // 補足はまとめて使い終わってから消す
    expect(mocks.clearLineState).toHaveBeenCalledWith('uid-1', 'photo-context-1');
    // 同じ食事なので食事タイプは揃える
    const saved = mocks.setLineState.mock.calls[0][1];
    expect(saved.pendingMeals.map(meal => meal.mealType)).toEqual(['dinner', 'dinner']);
    const message = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(message.type).toBe('flex');
    expect(JSON.stringify(message)).toContain('2品まとめて記録しますか？');
    expect(JSON.stringify(message)).toContain('620 kcal');
  });

  it('tells the user when some photos in the set could not be analyzed', async () => {
    mocks.analyzeImageWithGemini.mockResolvedValue({ error: 'boom' });
    mocks.addPhotoSetItem.mockResolvedValue({
      complete: true,
      meals: [{ foodName: '味噌汁', calories: 60, macros: {}, mealType: 'lunch' }],
    });

    await handleMealPhotoEvent(setEvent(1));

    // 失敗した写真も null で登録する（揃わずに待ち続けないように）
    expect(mocks.addPhotoSetItem.mock.calls[0][1].meal).toBeNull();
    // 1品だけ残ったら通常の確認カード + 失敗枚数の案内
    expect(mocks.setLineState.mock.calls[0][1].pendingMeal.foodName).toBe('味噌汁');
    const messages = mocks.replyOrPushMessage.mock.calls[0][1];
    expect(messages).toHaveLength(2);
    expect(messages[1].text).toContain('1枚は解析できませんでした');
  });
});
