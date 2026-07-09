/**
 * Tests for src/app/actions/food-search.js
 */

const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  return {
    generateContent,
    createModel: vi.fn(() => ({ generateContent })),
  };
});

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class {
      constructor() {}
      getGenerativeModel() { return { generateContent: mocks.generateContent }; }
    },
  };
});

vi.mock('@/app/actions/gemini-client', () => ({
  apiKey: 'test-key',
  MODELS_TO_TRY: ['model-1'],
  THINKING: { OFF: 0, MEDIUM: 1024, DYNAMIC: -1 },
  getGenAI: vi.fn(() => ({ mocked: true })),
  createModel: mocks.createModel,
  FOOD_SEARCH_SCHEMA: {},
  FOOD_ANALYSIS_SCHEMA: { name: 'food-analysis-schema' },
}));

import { estimateMealFromText, searchAiFood, searchFoodWithGemini } from '@/app/actions/food-search';

const makeResponse = (json) => ({
  response: { text: () => JSON.stringify(json) },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createModel.mockReturnValue({ generateContent: mocks.generateContent });
});

describe('searchAiFood', () => {
  it('returns suggestions array on success', async () => {
    const responseData = {
      suggestions: [
        { foodName: 'Ramen', calories: 500, macros: { protein: 15, fat: 20, carbs: 60 }, reasoning: 'Popular dish' },
      ],
    };
    mocks.generateContent.mockResolvedValue(makeResponse(responseData));

    const result = await searchAiFood('ramen');
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].foodName).toBe('Ramen');
  });

  it('adds model name to reasoning', async () => {
    const responseData = {
      suggestions: [
        { foodName: 'Sushi', calories: 300, macros: {}, reasoning: 'Fresh fish' },
      ],
    };
    mocks.generateContent.mockResolvedValue(makeResponse(responseData));

    const result = await searchAiFood('sushi');
    expect(result.suggestions[0].reasoning).toContain('[AI: model-1]');
  });

  it('returns empty suggestions when all models fail', async () => {
    mocks.generateContent.mockRejectedValue(new Error('All models down'));

    const result = await searchAiFood('test food');
    expect(result.suggestions).toEqual([]);
  });

  it('returns empty suggestions when response has no suggestions field', async () => {
    mocks.generateContent.mockResolvedValue(makeResponse({ data: 'invalid' }));

    const result = await searchAiFood('test');
    expect(result.suggestions).toEqual([]);
  });

  it('passes history context to prompt', async () => {
    const responseData = { suggestions: [{ foodName: 'Test', calories: 100, macros: {}, reasoning: 'OK' }] };
    mocks.generateContent.mockResolvedValue(makeResponse(responseData));

    const result = await searchAiFood('curry', 'Yesterday: rice, soup');
    expect(result.suggestions).toHaveLength(1);
    // Verify generateContent was called (prompt includes history context)
    expect(mocks.generateContent).toHaveBeenCalled();
  });
});

describe('searchFoodWithGemini', () => {
  it('is the same function as searchAiFood', () => {
    expect(searchFoodWithGemini).toBe(searchAiFood);
  });
});

describe('estimateMealFromText', () => {
  it('returns a single estimated meal from Gemini', async () => {
    const responseData = {
      foodName: 'サラダチキンとおにぎり',
      calories: 420,
      macros: { protein: 28, fat: 6, carbs: 58, fiber: null, sugar: 4, sodium: 820, potassium: null },
      breakdown: ['サラダチキン', 'おにぎり'],
      reasoning: '一般的な分量で推定',
    };
    mocks.generateContent.mockResolvedValue(makeResponse(responseData));

    const result = await estimateMealFromText('サラダチキンとおにぎり食べた');

    expect(result.foodName).toBe('サラダチキンとおにぎり');
    expect(result.macros.fiber).toBeNull();
    expect(result.reasoning).toContain('[AI: model-1]');
    expect(mocks.createModel).toHaveBeenCalledWith(expect.anything(), 'model-1', { name: 'food-analysis-schema' }, 0);
  });

  it('passes correction context into the prompt', async () => {
    mocks.generateContent.mockResolvedValue(makeResponse({
      foodName: 'ご飯少なめカレー',
      calories: 500,
      macros: { protein: 15, fat: 18, carbs: 70 },
      breakdown: [],
      reasoning: '補足を反映',
    }));

    await estimateMealFromText('カレーライス', 'ご飯半分');

    const prompt = mocks.generateContent.mock.calls[0][0];
    expect(prompt).toContain('カレーライス');
    expect(prompt).toContain('ご飯半分');
  });
});
