import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  return {
    generateContent,
    createModel: vi.fn(() => ({ generateContent })),
  };
});

vi.mock('@/app/actions/gemini-client', () => ({
  apiKey: 'test-key',
  ELENA_PERSONA: 'ELENA_PERSONA_TEST',
  MODELS_TO_TRY: ['model-1'],
  THINKING: { OFF: 0, MEDIUM: 1024, DYNAMIC: -1 },
  getGenAI: vi.fn(() => ({ mocked: true })),
  createModel: mocks.createModel,
}));

import { generateElenaChatReply } from '@/app/actions/line-chat';

const makeTextResponse = (text) => ({
  response: { text: () => text },
});

const chatContext = {
  userText: 'どうしても今甘いものが食べたい。コンビニで買えるものは？',
  user: {
    targetCalories: 2000,
    currentWeight: 65.2,
    targetWeight: 62,
    targetDate: '2026-09-01',
  },
  today: {
    dateId: '2026-07-09',
    totalCalories: 400,
    remainingCalories: 1600,
    totalMacros: { protein: 30, fat: 12, carbs: 42, fiber: 6, sugar: 12, sodium: 800, potassium: 500 },
    meals: [
      { mealType: 'breakfast', foodName: 'サラダチキン', calories: 220, macros: { protein: 25, fat: 3, carbs: 8 } },
    ],
  },
  recentWeights: [{ date: '2026-07-09', weight: 65.2 }],
  stockItems: [{ name: '鶏むね肉' }, { name: '卵' }],
  latestDailyEvaluation: { score: 78, title: 'あと一歩', advice: '脂質を抑えよう' },
  messageHistory: [
    { role: 'user', text: '昨日は夜にお腹すいた' },
    { role: 'assistant', text: '夜は高たんぱくで行こ！' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createModel.mockReturnValue({ generateContent: mocks.generateContent });
});

describe('generateElenaChatReply', () => {
  it('returns a plain text Gemini reply and uses the fast model setup', async () => {
    mocks.generateContent.mockResolvedValue(makeTextResponse('残り1600kcalあるから、低脂質の甘味で攻めよ！🍮'));

    const reply = await generateElenaChatReply(chatContext);

    expect(reply).toBe('残り1600kcalあるから、低脂質の甘味で攻めよ！🍮');
    expect(mocks.createModel).toHaveBeenCalledWith(expect.anything(), 'model-1', null, 0);
  });

  it('includes real calories and stock memo in the prompt', async () => {
    mocks.generateContent.mockResolvedValue(makeTextResponse('OK'));

    await generateElenaChatReply(chatContext);

    const prompt = mocks.generateContent.mock.calls[0][0];
    expect(prompt).toContain('ELENA_PERSONA_TEST');
    expect(prompt).toContain('目標カロリー: 2000 kcal');
    expect(prompt).toContain('摂取カロリー: 400 kcal');
    expect(prompt).toContain('残りカロリー: 1600 kcal');
    expect(prompt).toContain('PFC合計: P30g / F12g / C42g');
    expect(prompt).toContain('鶏むね肉, 卵');
    expect(prompt).toContain('昨日は夜にお腹すいた');
  });
});

describe('line chat prompt guardrails', () => {
  it('keeps the medical and meal-recording guards in the prompt', async () => {
    mocks.generateContent.mockResolvedValue(makeTextResponse('OK'));

    await generateElenaChatReply(chatContext);

    const prompt = mocks.generateContent.mock.calls[0][0];
    expect(prompt).toContain('症状の診断');
    expect(prompt).toContain('写真か');
    expect(prompt).toContain('◯◯食べた');
  });

  it('includes the mood-based meal suggestion instructions in the prompt', async () => {
    mocks.generateContent.mockResolvedValue(makeTextResponse('OK'));

    await generateElenaChatReply({
      ...chatContext,
      userText: 'ラーメンの気分。ちょっと疲れてる',
      messageHistory: [
        { role: 'assistant', text: 'これからなら、今の体調と気分、食べたいものを教えて！' },
      ],
    });

    const prompt = mocks.generateContent.mock.calls[0][0];
    expect(prompt).toContain('食事予定・気分への提案ルール');
    expect(prompt).toContain('食べたい気持ちに共感');
    expect(prompt).toContain('現実的なメニューを2〜3個');
    expect(prompt).toContain('我慢一辺倒の提案はしない');
    expect(prompt).toContain('食べたら写真か一言で送ってくださいね');
  });
});
