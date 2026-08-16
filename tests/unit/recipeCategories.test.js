import { describe, expect, it } from 'vitest';

import {
  RECIPE_CATEGORIES,
  UNCATEGORIZED_LABEL,
  getRecipeCategoryIcon,
  getRecipeCategoryLabel,
  groupRecipesByCategory,
  isRecipeCategory,
  normalizeRecipeCategory,
} from '@/lib/recipeCategories';

describe('recipeCategories', () => {
  it('defines unique category ids', () => {
    const ids = RECIPE_CATEGORIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('validates known categories', () => {
    expect(isRecipeCategory('main')).toBe(true);
    expect(isRecipeCategory('dessert')).toBe(true);
    expect(isRecipeCategory('unknown')).toBe(false);
    expect(isRecipeCategory(null)).toBe(false);
  });

  it('normalizes unknown values to null (未分類)', () => {
    expect(normalizeRecipeCategory('main')).toBe('main');
    expect(normalizeRecipeCategory('')).toBe(null);
    expect(normalizeRecipeCategory('typo')).toBe(null);
    expect(normalizeRecipeCategory(undefined)).toBe(null);
  });

  it('returns 未分類 label for null / unknown', () => {
    expect(getRecipeCategoryLabel('main')).toBe('主菜');
    expect(getRecipeCategoryLabel(null)).toBe(UNCATEGORIZED_LABEL);
    expect(getRecipeCategoryLabel('typo')).toBe(UNCATEGORIZED_LABEL);
    expect(getRecipeCategoryIcon('main')).toBe('🍗');
    expect(getRecipeCategoryIcon(null)).toBe('📄');
  });

  describe('groupRecipesByCategory', () => {
    const recipes = [
      { id: 'r1', foodName: 'サラダ', category: 'side' },
      { id: 'r2', foodName: '唐揚げ', category: 'main' },
      { id: 'r3', foodName: '古いレシピ' }, // カテゴリ未設定
      { id: 'r4', foodName: '味噌汁', category: 'soup' },
      { id: 'r5', foodName: '生姜焼き', category: 'main' },
    ];

    it('groups recipes keeping the defined category order, 未分類 last', () => {
      const groups = groupRecipesByCategory(recipes);
      expect(groups.map(g => g.id)).toEqual(['main', 'side', 'soup', null]);
      expect(groups[0].recipes.map(r => r.id)).toEqual(['r2', 'r5']);
      expect(groups.at(-1).label).toBe(UNCATEGORIZED_LABEL);
      expect(groups.at(-1).recipes.map(r => r.id)).toEqual(['r3']);
    });

    it('omits empty categories', () => {
      const groups = groupRecipesByCategory([{ id: 'r1', category: 'dessert' }]);
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('dessert');
    });

    it('treats unknown category values as 未分類', () => {
      const groups = groupRecipesByCategory([{ id: 'r1', category: 'typo' }]);
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe(null);
    });

    it('returns an empty list for no recipes', () => {
      expect(groupRecipesByCategory([])).toEqual([]);
    });
  });
});
