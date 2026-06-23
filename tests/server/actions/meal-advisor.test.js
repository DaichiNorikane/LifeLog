/**
 * Tests for src/app/actions/meal-advisor.js
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
  MODELS_TO_TRY: ['model-1'],
  THINKING: { OFF: 0, MEDIUM: 1024, DYNAMIC: -1 },
  getGenAI: vi.fn(),
  createModel: vi.fn(() => ({ generateContent: mockGenerateContent })),
  extractJSON: vi.fn(),
  MEAL_ADVISOR_SCHEMA: {},
}));

import { suggestNextMeal } from '@/app/actions/meal-advisor';

const makeResponse = (json) => ({
  response: { text: () => JSON.stringify(json) },
});

const baseDailyLog = {
  totalCalories: 800,
  targetCalories: 2000,
  macros: { protein: 30, fat: 20, carbs: 100 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('suggestNextMeal', () => {
  it('returns suggestions on success', async () => {
    const responseData = {
      mealCategory: '夕食',
      suggestions: [{ name: 'Grilled Fish', reason: 'Healthy', calories: 400 }],
      advice: 'Good choice',
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await suggestNextMeal([], baseDailyLog);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].name).toBe('Grilled Fish');
  });

  it('morning, no breakfast -> suggests breakfast', async () => {
    // 8:00 JST = 23:00 UTC previous day
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T23:00:00Z'));

    const responseData = {
      mealCategory: '朝食',
      suggestions: [{ name: 'Oatmeal', reason: 'Great breakfast', calories: 300 }],
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await suggestNextMeal([], baseDailyLog, 'auto');
    expect(result).toBeDefined();
    expect(result.suggestions).toBeDefined();
    expect(result.debug.suggestedMealType).toBe('breakfast');
  });

  it('after lunch, no dinner -> suggests dinner', async () => {
    // 18:00 JST = 09:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-16T09:00:00Z'));

    const history = [
      { foodName: 'Rice', mealType: 'breakfast', calories: 300 },
      { foodName: 'Pasta', mealType: 'lunch', calories: 600 },
    ];

    const responseData = {
      mealCategory: '夕食',
      suggestions: [{ name: 'Soup', calories: 300 }],
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await suggestNextMeal(history, baseDailyLog, 'auto');
    expect(result.suggestions).toBeDefined();
    expect(result.debug.suggestedMealType).toBe('dinner');
  });

  it('all meals eaten, low calories -> suggests additional food', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-16T12:00:00Z')); // 21:00 JST

    const history = [
      { foodName: 'Toast', mealType: 'breakfast', calories: 200 },
      { foodName: 'Salad', mealType: 'lunch', calories: 300 },
      { foodName: 'Soup', mealType: 'dinner', calories: 200 },
    ];
    const lowCalLog = { ...baseDailyLog, totalCalories: 700, targetCalories: 2000 };

    const responseData = {
      mealCategory: '夕食',
      suggestions: [{ name: 'Protein shake', calories: 200 }],
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await suggestNextMeal(history, lowCalLog, 'auto');
    expect(result.suggestions).toBeDefined();
    // Low calories with all meals eaten -> suggests dinner (additional)
    expect(result.debug.suggestedMealType).toBe('dinner');
  });

  it('all meals eaten, not low cal -> suggests skip', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-16T12:00:00Z')); // 21:00 JST

    const history = [
      { foodName: 'Toast', mealType: 'breakfast', calories: 400 },
      { foodName: 'Bento', mealType: 'lunch', calories: 700 },
      { foodName: 'Curry', mealType: 'dinner', calories: 800 },
    ];
    const fullLog = { ...baseDailyLog, totalCalories: 1900, targetCalories: 2000 };

    const responseData = {
      mealCategory: '食事を控える',
      suggestions: [],
      advice: 'No more eating',
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await suggestNextMeal(history, fullLog, 'auto');
    expect(result).toBeDefined();
    expect(result.debug.suggestedMealType).toBe('skip');
  });

  it('over calories -> suggests skip for dinner', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-16T09:00:00Z')); // 18:00 JST

    const history = [
      { foodName: 'Burger', mealType: 'lunch', calories: 1200 },
    ];
    const overLog = { ...baseDailyLog, totalCalories: 2500, targetCalories: 2000 };

    const responseData = { suggestions: [], advice: 'Stop eating' };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await suggestNextMeal(history, overLog, 'auto');
    expect(result).toBeDefined();
    expect(result.debug.suggestedMealType).toBe('skip');
  });

  it('falls back with error message when all models fail', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API down'));

    const result = await suggestNextMeal([], baseDailyLog);
    expect(result.suggestions).toEqual([]);
    expect(result.advice).toContain('AI');
  });

  it('handles missing apiKey by throwing in loop', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API Key is missing.'));
    const result = await suggestNextMeal([], baseDailyLog);
    expect(result.suggestions).toEqual([]);
  });

  it('includes stock items context', async () => {
    const responseData = {
      suggestions: [{ name: 'Egg Rice', calories: 400 }],
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const stockItems = [{ name: 'Eggs' }, { name: 'Rice' }];
    const result = await suggestNextMeal([], baseDailyLog, 'auto', stockItems);
    expect(result.suggestions).toHaveLength(1);
  });

  it('includes debug info in result', async () => {
    const responseData = { suggestions: [{ name: 'Test' }] };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await suggestNextMeal([], baseDailyLog);
    expect(result.debug).toBeDefined();
    expect(result.debug.hour).toBeDefined();
  });
});
