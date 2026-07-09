import { describe, expect, it } from 'vitest';
import { buildEditConfirmFlex } from '@/lib/line/flex/editConfirm';
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

  it('builds the confirm card with type switch buttons', () => {
    const flex = buildMealConfirmFlex(meal, 'sid-test');
    const typeRow = flex.contents.footer.contents[0];

    expect(typeRow.layout).toBe('horizontal');
    expect(typeRow.contents).toHaveLength(4);
    expect(typeRow.contents.map(button => button.action.data)).toEqual([
      'action=set_type&sid=sid-test&type=breakfast',
      'action=set_type&sid=sid-test&type=lunch',
      'action=set_type&sid=sid-test&type=dinner',
      'action=set_type&sid=sid-test&type=snack',
    ]);
    expect(typeRow.contents[1]).toEqual(expect.objectContaining({
      height: 'sm',
      style: 'primary',
      color: '#10B981',
    }));
    expect(typeRow.contents[0]).toEqual(expect.objectContaining({
      height: 'sm',
      style: 'secondary',
    }));
  });

  it('builds the edit confirmation card', () => {
    expect(buildEditConfirmFlex({
      operation: 'delete',
      mealType: null,
      targetNames: ['チョコレート（間食/145kcal）'],
      confirmText: 'チョコレート(間食/145kcal)を削除',
    }, 'sid-edit')).toMatchSnapshot();
  });

  it('builds the saved card', () => {
    expect(buildMealSavedFlex(meal, { score: 8, reason: 'いい感じ！でも野菜も足したいね✨' })).toMatchSnapshot();
  });
});
