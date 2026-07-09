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

import { classifyLineIntent } from '@/app/actions/line-intent';

const makeResponse = (json) => ({
  response: { text: () => JSON.stringify(json) },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createModel.mockReturnValue({ generateContent: mocks.generateContent });
});

describe('classifyLineIntent', () => {
  it('classifies saved-record edits as edit_record', async () => {
    mocks.generateContent.mockResolvedValue(makeResponse({ intent: 'edit_record', mealDescription: null }));

    const result = await classifyLineIntent('さっきのチョコレートを記録から削除して');

    expect(result).toEqual({ intent: 'edit_record', mealDescription: null });
    const schema = mocks.createModel.mock.calls[0][2];
    expect(schema.properties.intent.enum).toContain('edit_record');
    expect(mocks.generateContent.mock.calls[0][0]).toContain('削除');
  });

  it('keeps food cravings as other instead of log_meal', async () => {
    mocks.generateContent.mockResolvedValue(makeResponse({ intent: 'other', mealDescription: null }));

    const result = await classifyLineIntent('唐揚げ食べたい');

    expect(result).toEqual({ intent: 'other', mealDescription: null });
    const prompt = mocks.generateContent.mock.calls[0][0];
    expect(prompt).toContain('唐揚げ食べたい');
    expect(prompt).toContain('「唐揚げ食べたい」→ other');
    expect(prompt).toContain('「唐揚げ食べた」→ log_meal');
  });

  it('keeps completed meal reports as log_meal', async () => {
    mocks.generateContent.mockResolvedValue(makeResponse({ intent: 'log_meal', mealDescription: '唐揚げ' }));

    const result = await classifyLineIntent('唐揚げ食べた');

    expect(result).toEqual({ intent: 'log_meal', mealDescription: '唐揚げ' });
  });
});
