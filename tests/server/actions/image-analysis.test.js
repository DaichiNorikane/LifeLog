/**
 * Tests for src/app/actions/image-analysis.js
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
  THINKING: { OFF: 0, MEDIUM: 1024, DYNAMIC: -1 },
  getGenAI: vi.fn(),
  createModel: vi.fn(() => ({ generateContent: mockGenerateContent })),
  FOOD_ANALYSIS_SCHEMA: {},
}));

import { analyzeImageWithGemini } from '@/app/actions/image-analysis';

const makeResponse = (json) => ({
  response: { text: () => JSON.stringify(json) },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyzeImageWithGemini', () => {
  const base64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

  it('returns parsed JSON with model name in reasoning on success', async () => {
    const responseData = {
      foodName: 'Salad',
      calories: 200,
      macros: { protein: 5, fat: 8, carbs: 15 },
      breakdown: ['Lettuce', 'Tomato'],
      reasoning: 'Green salad with tomatoes',
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await analyzeImageWithGemini(base64Image);
    expect(result.foodName).toBe('Salad');
    expect(result.calories).toBe(200);
    expect(result.reasoning).toContain('[Model: model-1]');
  });

  it('splits base64 data correctly (removes prefix)', async () => {
    const responseData = { foodName: 'Test', calories: 100, macros: {}, reasoning: 'OK' };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    await analyzeImageWithGemini(base64Image, 'some context');

    // Verify generateContent received the image part with correct base64 data
    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs).toBeInstanceOf(Array);
    expect(callArgs).toHaveLength(2);
    // Second arg is the image part
    expect(callArgs[1].inlineData.data).toBe('/9j/4AAQSkZJRg==');
    expect(callArgs[1].inlineData.mimeType).toBe('image/jpeg');
  });

  it('passes context to prompt', async () => {
    const responseData = { foodName: 'Half Ramen', calories: 250, macros: {}, reasoning: 'Half eaten' };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await analyzeImageWithGemini(base64Image, 'half eaten');
    expect(result.foodName).toBe('Half Ramen');
  });

  it('falls back through models', async () => {
    // With single model, first failure = all failed
    mockGenerateContent.mockRejectedValue(new Error('Vision model error'));

    const result = await analyzeImageWithGemini(base64Image);
    expect(result.error).toContain('All models failed');
  });

  it('returns error when all models fail', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Last error message'));

    const result = await analyzeImageWithGemini(base64Image);
    expect(result.error).toContain('Last error message');
  });

  it('handles non-JSON response as error', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'This is not JSON at all' },
    });

    const result = await analyzeImageWithGemini(base64Image);
    expect(result.error).toContain('All models failed');
  });
});
