import { describe, expect, it } from 'vitest';
import { buildDailySummaryFlex } from '@/lib/line/flex/dailySummary';
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

  it('builds the confirm card with direct-save type buttons', () => {
    const flex = buildMealConfirmFlex(meal, 'sid-test');
    const typeRowTop = flex.contents.footer.contents[0];
    const typeRowBottom = flex.contents.footer.contents[1];

    expect(typeRowTop.layout).toBe('horizontal');
    expect(typeRowTop.contents).toHaveLength(2);
    expect(typeRowBottom.contents).toHaveLength(2);
    const allButtons = [...typeRowTop.contents, ...typeRowBottom.contents];
    expect(allButtons.map(button => button.action.data)).toEqual([
      'action=save_meal&sid=sid-test&type=breakfast',
      'action=save_meal&sid=sid-test&type=lunch',
      'action=save_meal&sid=sid-test&type=dinner',
      'action=save_meal&sid=sid-test&type=snack',
    ]);
    expect(allButtons[1]).toEqual(expect.objectContaining({
      height: 'sm',
      style: 'primary',
      color: '#10B981',
    }));
    expect(allButtons[0]).toEqual(expect.objectContaining({
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

  it('builds the daily summary card', () => {
    expect(buildDailySummaryFlex({
      dateId: '2026-07-10',
      totalCalories: 1250,
      targetCalories: 2000,
      totalMacros: { protein: 60, fat: 35, carbs: 150, fiber: 8, sugar: null, sodium: 2100, potassium: null },
      mealsCount: 3,
    })).toMatchSnapshot();
  });
});
