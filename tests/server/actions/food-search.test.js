/**
 * Tests for src/app/actions/food-search.js
 */

const mockGenerateContent = vi.fn();

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class {
      constructor() {}
      getGenerativeModel() { return { generateContent: mockGenerateContent }; }
    },
  };
});

vi.mock('@/app/actions/gemini-client', () => ({
  apiKey: 'test-key',
  MODELS_TO_TRY: ['model-1'],
}));

import { searchAiFood, searchFoodWithGemini } from '@/app/actions/food-search';

const makeResponse = (json) => ({
  response: { text: () => JSON.stringify(json) },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchAiFood', () => {
  it('returns suggestions array on success', async () => {
    const responseData = {
      suggestions: [
        { foodName: 'Ramen', calories: 500, macros: { protein: 15, fat: 20, carbs: 60 }, reasoning: 'Popular dish' },
      ],
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

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
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await searchAiFood('sushi');
    expect(result.suggestions[0].reasoning).toContain('[AI: model-1]');
  });

  it('returns empty suggestions when all models fail', async () => {
    mockGenerateContent.mockRejectedValue(new Error('All models down'));

    const result = await searchAiFood('test food');
    expect(result.suggestions).toEqual([]);
  });

  it('returns empty suggestions when response has no suggestions field', async () => {
    mockGenerateContent.mockResolvedValue(makeResponse({ data: 'invalid' }));

    const result = await searchAiFood('test');
    expect(result.suggestions).toEqual([]);
  });

  it('passes history context to prompt', async () => {
    const responseData = { suggestions: [{ foodName: 'Test', calories: 100, macros: {}, reasoning: 'OK' }] };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await searchAiFood('curry', 'Yesterday: rice, soup');
    expect(result.suggestions).toHaveLength(1);
    // Verify generateContent was called (prompt includes history context)
    expect(mockGenerateContent).toHaveBeenCalled();
  });
});

describe('searchFoodWithGemini', () => {
  it('is the same function as searchAiFood', () => {
    expect(searchFoodWithGemini).toBe(searchAiFood);
  });
});
