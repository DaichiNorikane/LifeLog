import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const serverTimestampSentinel = { __fieldValue: 'serverTimestamp' };
  return {
    serverTimestampSentinel,
    serverTimestamp: vi.fn(() => serverTimestampSentinel),
    mealAdd: vi.fn(),
    weightSet: vi.fn(),
    weightDoc: vi.fn(),
    userDoc: vi.fn(),
    dbCollection: vi.fn(),
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: mocks.dbCollection,
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: mocks.serverTimestamp,
  },
}));

import { addMealAdmin, addWeightAdmin } from '@/lib/firebase/adminHelpers';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serverTimestamp.mockReturnValue(mocks.serverTimestampSentinel);
  mocks.mealAdd.mockResolvedValue({ id: 'meal-1' });
  mocks.weightSet.mockResolvedValue(undefined);
  mocks.weightDoc.mockReturnValue({ set: mocks.weightSet });
  mocks.userDoc.mockImplementation(() => ({
    collection: vi.fn((name) => {
      if (name === 'meals') return { add: mocks.mealAdd };
      if (name === 'weights') return { doc: mocks.weightDoc };
      return {};
    }),
  }));
  mocks.dbCollection.mockImplementation((name) => {
    if (name === 'users') return { doc: mocks.userDoc };
    return {};
  });
});

describe('firebase admin helpers', () => {
  it('preserves FieldValue.serverTimestamp sentinel when saving meals', async () => {
    const id = await addMealAdmin('uid-1', {
      foodName: 'サラダチキン',
      calories: Number.NaN,
      macros: {
        protein: 25,
        fat: 3,
        carbs: 8,
        fiber: null,
        sugar: 0,
        sodium: undefined,
      },
      timestamp: '2026-07-09T03:00:00.000Z',
      image: undefined,
    });

    expect(id).toBe('meal-1');
    expect(mocks.mealAdd).toHaveBeenCalledTimes(1);

    const payload = mocks.mealAdd.mock.calls[0][0];
    expect(payload.createdAt).toBe(mocks.serverTimestampSentinel);
    expect(payload.calories).toBe(0);
    expect(payload.image).toBeNull();
    expect(payload.macros.fiber).toBeNull();
    expect(payload.macros.sugar).toBe(0);
    expect(payload.macros.sodium).toBeNull();
  });

  it('preserves FieldValue.serverTimestamp sentinel when saving weights', async () => {
    const result = await addWeightAdmin('uid-1', 65.2, new Date('2026-07-09T00:00:00.000Z'));

    expect(result.id).toBe('2026-07-09');
    expect(mocks.weightDoc).toHaveBeenCalledWith('2026-07-09');
    expect(mocks.weightSet).toHaveBeenCalledTimes(1);

    const [payload, options] = mocks.weightSet.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({
      weight: 65.2,
      date: '2026-07-09',
      timestamp: '2026-07-09T00:00:00.000Z',
    }));
    expect(payload.updatedAt).toBe(mocks.serverTimestampSentinel);
    expect(options).toEqual({ merge: true });
  });
});
