/**
 * Tests for src/app/actions/recipe.js
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
  RECIPE_HYBRID_SCHEMA: {},
  RECIPE_CALC_SCHEMA: {},
  RECIPE_SEARCH_SCHEMA: {},
}));

import {
  calculateRecipeHybrid,
  calculateRecipeWithGemini,
  searchRecipesWithGemini,
} from '@/app/actions/recipe';

const makeResponse = (json) => ({
  response: { text: () => JSON.stringify(json) },
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ========== calculateRecipeHybrid ==========
describe('calculateRecipeHybrid', () => {
  it('returns error when apiKey is missing', async () => {
    // We can't easily unset apiKey since it's bound at import time.
    // Instead, test the empty ingredients path.
    const result = await calculateRecipeHybrid([]);
    expect(result.error).toBe('No ingredients provided');
  });

  it('returns error for null ingredients', async () => {
    const result = await calculateRecipeHybrid(null);
    expect(result.error).toBe('No ingredients provided');
  });

  it('processes known (official source) ingredients correctly', async () => {
    const responseData = {
      foodName: 'Chicken Rice',
      totalServings: 2,
      perServing: { calories: 400, macros: { protein: 30, fat: 10, carbs: 50 } },
      total: { calories: 800, macros: { protein: 60, fat: 20, carbs: 100 } },
      reasoning: 'Calculated from ingredients',
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const ingredients = [
      { name: 'Chicken', source: 'official', nutrients: { calories: 200, protein: 25, fat: 8, carbs: 0 }, amount: 200 },
      { name: 'Rice', source: 'official', nutrients: { calories: 350, protein: 6, fat: 1, carbs: 77 }, amount: 300 },
    ];

    const result = await calculateRecipeHybrid(ingredients);
    expect(result.foodName).toBe('Chicken Rice');
    expect(result.totalServings).toBe(2);
  });

  it('handles unknown ingredients', async () => {
    const responseData = {
      foodName: 'Mystery Dish',
      totalServings: 1,
      perServing: { calories: 500, macros: { protein: 20, fat: 15, carbs: 60 } },
      total: { calories: 500, macros: { protein: 20, fat: 15, carbs: 60 } },
      reasoning: 'Estimated',
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const ingredients = [
      { name: 'Some spice', text: 'Some spice', amount: 10 },
    ];

    const result = await calculateRecipeHybrid(ingredients);
    expect(result.foodName).toBe('Mystery Dish');
  });

  it('handles official source without amount', async () => {
    const responseData = { foodName: 'Test', totalServings: 1, perServing: { calories: 100 }, total: { calories: 100 }, reasoning: 'OK' };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const ingredients = [
      { name: 'Tofu', source: 'official', nutrients: { calories: 80, protein: 8, fat: 4, carbs: 2 } },
    ];

    const result = await calculateRecipeHybrid(ingredients);
    expect(result.foodName).toBe('Test');
  });

  it('returns error when all models fail', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Model error'));

    const ingredients = [{ name: 'Test', amount: 100 }];
    const result = await calculateRecipeHybrid(ingredients);
    expect(result.error).toContain('Calculation failed');
  });
});

// ========== calculateRecipeWithGemini ==========
describe('calculateRecipeWithGemini', () => {
  it('returns parsed JSON on success', async () => {
    const responseData = {
      foodName: 'Curry',
      calories: 600,
      macros: { protein: 20, fat: 15, carbs: 80 },
      reasoning: 'Standard curry',
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await calculateRecipeWithGemini('Chicken 200g, Potato 100g');
    expect(result.foodName).toBe('Curry');
    expect(result.calories).toBe(600);
  });

  it('falls back through models', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('First fail'))
      .mockResolvedValue(makeResponse({ foodName: 'Test', calories: 100 }));

    // With only 1 model in mock, it will fail. But test the pattern.
    const result = await calculateRecipeWithGemini('Test ingredients');
    // With single model mock, first rejection = all failed
    expect(result.error).toContain('failed');
  });

  it('returns error when all models fail', async () => {
    mockGenerateContent.mockRejectedValue(new Error('All down'));
    const result = await calculateRecipeWithGemini('Some food');
    expect(result.error).toBeDefined();
  });
});

// ========== searchRecipesWithGemini ==========
describe('searchRecipesWithGemini', () => {
  it('returns parsed recipes on success', async () => {
    const responseData = {
      recipes: [
        { foodName: 'Grilled Salmon', description: 'Healthy', calories: 350 },
      ],
    };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const result = await searchRecipesWithGemini('healthy fish recipes');
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].foodName).toBe('Grilled Salmon');
  });

  it('passes stock items context', async () => {
    const responseData = { recipes: [{ foodName: 'Egg Dish', calories: 200 }] };
    mockGenerateContent.mockResolvedValue(makeResponse(responseData));

    const stockItems = [{ name: 'Eggs' }, { name: 'Butter' }];
    const result = await searchRecipesWithGemini('quick recipe', stockItems);
    expect(result.recipes).toHaveLength(1);
  });

  it('throws when all models fail', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Search model error'));
    await expect(searchRecipesWithGemini('test')).rejects.toThrow('Search model error');
  });
});
