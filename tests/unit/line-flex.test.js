import { describe, expect, it } from 'vitest';
import { buildMealConfirmFlex } from '@/lib/line/flex/mealConfirm';
import { buildMealSavedFlex } from '@/lib/line/flex/mealSaved';

const meal = {
  foodName: 'サラダチキンとおにぎり',
  calories: 420,
  macros: {
    protein: 28,
    fat: 6,
    carbs: 58,
    fiber: null,
    sugar: 4,
    sodium: 820,
    potassium: null,
  },
  mealType: 'lunch',
};

describe('LINE meal Flex templates', () => {
  it('builds the confirm card', () => {
    expect(buildMealConfirmFlex(meal, 'sid-test')).toMatchSnapshot();
  });

  it('builds the saved card', () => {
    expect(buildMealSavedFlex(meal, { score: 8, reason: 'いい感じ！でも野菜も足したいね✨' })).toMatchSnapshot();
  });
});
