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
  MODELS_TO_TRY: ['model-1'],
  THINKING: { OFF: 0, MEDIUM: 1024, DYNAMIC: -1 },
  getGenAI: vi.fn(() => ({ mocked: true })),
  createModel: mocks.createModel,
}));

import { resolveMealEditPlan } from '@/app/actions/meal-edit';

const makeResponse = (json) => ({
  response: { text: () => JSON.stringify(json) },
});

const meals = [
  { id: 'm1', foodName: 'チョコレート', mealType: 'snack', calories: 145, jstDateTime: '2026/07/09 15:10' },
  { id: 'm2', foodName: 'カレー', mealType: 'lunch', calories: 650, jstDateTime: '2026/07/09 12:20' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createModel.mockReturnValue({ generateContent: mocks.generateContent });
});

describe('resolveMealEditPlan', () => {
  it('parses delete plans and includes meals in the prompt', async () => {
    mocks.generateContent.mockResolvedValue(makeResponse({
      operation: 'delete',
      mealType: null,
      targetIds: ['m1'],
      confirmText: 'チョコレート(間食/145kcal)を削除',
      notFoundReason: null,
    }));

    const result = await resolveMealEditPlan('さっきのチョコレートを削除して', meals);

    expect(result.operation).toBe('delete');
    expect(result.targetIds).toEqual(['m1']);
    const prompt = mocks.generateContent.mock.calls[0][0];
    expect(prompt).toContain('id=m1');
    expect(prompt).toContain('チョコレート');
    expect(prompt).toContain('2026/07/09 15:10');
    expect(mocks.createModel).toHaveBeenCalledWith(expect.anything(), 'model-1', expect.any(Object), 0);
  });

  it('parses change_type plans', async () => {
    mocks.generateContent.mockResolvedValue(makeResponse({
      operation: 'change_type',
      mealType: 'dinner',
      targetIds: ['m2'],
      confirmText: 'カレーを夕食に変更',
      notFoundReason: null,
    }));

    const result = await resolveMealEditPlan('カレーを夕食にして', meals);

    expect(result).toEqual({
      operation: 'change_type',
      mealType: 'dinner',
      targetIds: ['m2'],
      confirmText: 'カレーを夕食に変更',
      notFoundReason: null,
    });
  });

  it('parses none plans with notFoundReason', async () => {
    mocks.generateContent.mockResolvedValue(makeResponse({
      operation: 'none',
      mealType: null,
      targetIds: [],
      confirmText: '',
      notFoundReason: 'その記録は見つからなかったよ😢',
    }));

    const result = await resolveMealEditPlan('昨日のラーメン消して', meals);

    expect(result.operation).toBe('none');
    expect(result.targetIds).toEqual([]);
    expect(result.notFoundReason).toContain('見つからなかった');
  });
});
