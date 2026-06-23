/**
 * Tests for src/app/actions/quiz.js
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
  ELENA_PERSONA: 'Test persona',
  MODELS_TO_TRY: ['model-1', 'model-2', 'model-3'],
  THINKING: { OFF: 0, MEDIUM: 1024, DYNAMIC: -1 },
  getGenAI: vi.fn(),
  createModel: vi.fn(() => ({ generateContent: mockGenerateContent })),
  QUIZ_SCHEMA: {},
}));

import { generateQuizWithGemini } from '@/app/actions/quiz';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateQuizWithGemini', () => {
  const sampleQuizzes = [
    {
      question: 'What is protein?',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      explanation: 'Protein is essential',
    },
    {
      question: 'Best breakfast?',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 2,
      explanation: 'Balanced meal',
    },
  ];

  it('returns parsed array on success', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(sampleQuizzes) },
    });

    const result = await generateQuizWithGemini(2);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].question).toBe('What is protein?');
    expect(result[0].options).toHaveLength(4);
    expect(result[0].correctIndex).toBe(0);
  });

  it('uses local MODELS array (3 models)', async () => {
    // First two fail, third succeeds
    mockGenerateContent
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify(sampleQuizzes) },
      });

    const result = await generateQuizWithGemini(2);
    expect(Array.isArray(result)).toBe(true);
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it('returns error object when all fail', async () => {
    mockGenerateContent.mockRejectedValue(new Error('All models down'));

    const result = await generateQuizWithGemini(5);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Failed to generate quizzes');
    expect(result.details).toBeDefined();
  });

  it('returns error when response is not a valid JSON array', async () => {
    mockGenerateContent.mockReset();
    mockGenerateContent.mockResolvedValue({
      response: { text: () => '{"not": "an array"}' },
    });

    // non-array JSON → throws → tries next model → all fail
    const result = await generateQuizWithGemini(3);
    expect(result.error).toBeDefined();
  });

  it('defaults count to 5', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(sampleQuizzes) },
    });

    await generateQuizWithGemini();
    // Just verify it runs without error with default param
    expect(mockGenerateContent).toHaveBeenCalled();
  });
});
