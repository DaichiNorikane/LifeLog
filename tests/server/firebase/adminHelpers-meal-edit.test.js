import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbCollection: vi.fn(),
  userDoc: vi.fn(),
  userCollection: vi.fn(),
  mealsWhere: vi.fn(),
  mealsOrderBy: vi.fn(),
  mealsLimit: vi.fn(),
  mealsGet: vi.fn(),
  mealDoc: vi.fn(),
  mealDelete: vi.fn(),
  mealUpdate: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: mocks.dbCollection,
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => 'server-timestamp'),
  },
}));

import {
  deleteMealsAdmin,
  getRecentMealsAdmin,
  updateMealsTypeAdmin,
} from '@/lib/firebase/adminHelpers';

const doc = (id, data) => ({
  id,
  data: () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mealsGet.mockResolvedValue({
    docs: [
      doc('meal-1', { foodName: 'カレー', mealType: 'lunch', calories: 650 }),
      doc('meal-2', { foodName: 'チョコレート', mealType: 'snack', calories: 145 }),
    ],
  });
  mocks.mealsWhere.mockReturnValue({ orderBy: mocks.mealsOrderBy });
  mocks.mealsOrderBy.mockReturnValue({ limit: mocks.mealsLimit });
  mocks.mealsLimit.mockReturnValue({ get: mocks.mealsGet });
  mocks.mealDelete.mockResolvedValue(undefined);
  mocks.mealUpdate.mockResolvedValue(undefined);
  mocks.mealDoc.mockImplementation((id) => ({
    id,
    delete: mocks.mealDelete,
    update: mocks.mealUpdate,
  }));
  mocks.userCollection.mockImplementation((name) => {
    if (name === 'meals') {
      return {
        where: mocks.mealsWhere,
        doc: mocks.mealDoc,
      };
    }
    return {};
  });
  mocks.userDoc.mockReturnValue({
    collection: mocks.userCollection,
  });
  mocks.dbCollection.mockImplementation((name) => {
    if (name === 'users') return { doc: mocks.userDoc };
    return {};
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('meal edit admin helpers', () => {
  it('queries recent meals by timestamp desc with doc ids', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T12:00:00.000Z'));

    const meals = await getRecentMealsAdmin('uid-1', { sinceMs: 1000, limit: 5 });

    expect(mocks.dbCollection).toHaveBeenCalledWith('users');
    expect(mocks.userDoc).toHaveBeenCalledWith('uid-1');
    expect(mocks.userCollection).toHaveBeenCalledWith('meals');
    expect(mocks.mealsWhere).toHaveBeenCalledWith('timestamp', '>=', '2026-07-09T11:59:59.000Z');
    expect(mocks.mealsOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(mocks.mealsLimit).toHaveBeenCalledWith(5);
    expect(meals).toEqual([
      { id: 'meal-1', foodName: 'カレー', mealType: 'lunch', calories: 650 },
      { id: 'meal-2', foodName: 'チョコレート', mealType: 'snack', calories: 145 },
    ]);
  });

  it('deletes each target meal ref once and ignores blank/duplicate ids', async () => {
    const count = await deleteMealsAdmin('uid-1', ['meal-1', 'meal-2', 'meal-1', '']);

    expect(count).toBe(2);
    expect(mocks.mealDoc).toHaveBeenNthCalledWith(1, 'meal-1');
    expect(mocks.mealDoc).toHaveBeenNthCalledWith(2, 'meal-2');
    expect(mocks.mealDelete).toHaveBeenCalledTimes(2);
  });

  it('updates each target meal type once and ignores blank/duplicate ids', async () => {
    const count = await updateMealsTypeAdmin('uid-1', ['meal-1', 'meal-2', 'meal-1', ''], 'dinner');

    expect(count).toBe(2);
    expect(mocks.mealDoc).toHaveBeenNthCalledWith(1, 'meal-1');
    expect(mocks.mealDoc).toHaveBeenNthCalledWith(2, 'meal-2');
    expect(mocks.mealUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.mealUpdate).toHaveBeenCalledWith({ mealType: 'dinner' });
  });

  it('rejects invalid meal types before updating refs', async () => {
    await expect(updateMealsTypeAdmin('uid-1', ['meal-1'], 'brunch')).rejects.toThrow('Invalid mealType');

    expect(mocks.mealDoc).not.toHaveBeenCalled();
    expect(mocks.mealUpdate).not.toHaveBeenCalled();
  });
});
