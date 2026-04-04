/**
 * Tests for src/lib/firebase/firestore.js
 * Comprehensive CRUD function tests with mocked Firebase SDK
 */

const mockDocSnap = {
  exists: vi.fn(() => true),
  data: vi.fn(() => ({ name: 'test' })),
  id: 'doc1',
};

const mockQuerySnap = {
  docs: [{ id: 'doc1', data: () => ({ name: 'test' }), ref: { path: 'doc1' } }],
  empty: false,
  size: 1,
};

vi.mock('@/lib/firebase/config', () => ({ db: {} }));

const mockAddDoc = vi.fn(() => Promise.resolve({ id: 'newDoc1' }));
const mockGetDocs = vi.fn(() => Promise.resolve(mockQuerySnap));
const mockGetDoc = vi.fn(() => Promise.resolve(mockDocSnap));
const mockSetDoc = vi.fn(() => Promise.resolve());
const mockDeleteDoc = vi.fn(() => Promise.resolve());
const mockUpdateDoc = vi.fn(() => Promise.resolve());
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn(() => Promise.resolve());
const mockWriteBatch = vi.fn(() => ({ delete: mockBatchDelete, commit: mockBatchCommit }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'colRef'),
  addDoc: (...args) => mockAddDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: vi.fn(() => 'queryRef'),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  doc: vi.fn(() => 'docRef'),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  writeBatch: (...args) => mockWriteBatch(...args),
  Timestamp: { now: vi.fn(() => ({ seconds: 123, nanoseconds: 0 })) },
}));

import {
  getUserProfile,
  addMealToFirestore,
  getMealsFromFirestore,
  deleteMealFromFirestore,
  updateMealInFirestore,
  saveUserProfile,
  addWeightToFirestore,
  getWeightsFromFirestore,
  getRecentMeals,
  addStockItem,
  getStockItems,
  deleteStockItem,
  addRecipeToFirestore,
  getRecipesFromFirestore,
  deleteRecipeFromFirestore,
  saveGameScore,
  getLeaderboard,
  resetLeaderboard,
  saveDailyEvaluation,
  getDailyEvaluation,
  saveQuizToStock,
  updateQuizResult,
  getQuizFromStock,
  getQuizStockCount,
  saveLinkCode,
  addSearchHistory,
  getSearchHistory,
} from '@/lib/firebase/firestore';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset defaults
  mockDocSnap.exists.mockReturnValue(true);
  mockDocSnap.data.mockReturnValue({ name: 'test' });
  mockQuerySnap.docs = [{ id: 'doc1', data: () => ({ name: 'test' }), ref: { path: 'doc1' } }];
  mockQuerySnap.empty = false;
  mockQuerySnap.size = 1;
  mockAddDoc.mockResolvedValue({ id: 'newDoc1' });
  mockGetDocs.mockResolvedValue(mockQuerySnap);
  mockGetDoc.mockResolvedValue(mockDocSnap);
  mockSetDoc.mockResolvedValue();
  mockDeleteDoc.mockResolvedValue();
  mockUpdateDoc.mockResolvedValue();
});

// ========== getUserProfile ==========
describe('getUserProfile', () => {
  it('returns user data when document exists', async () => {
    mockDocSnap.exists.mockReturnValue(true);
    mockDocSnap.data.mockReturnValue({ displayName: 'Daichi', targetCalories: 2000 });

    const result = await getUserProfile('user1');
    expect(result).toEqual({ displayName: 'Daichi', targetCalories: 2000 });
  });

  it('returns null when document does not exist', async () => {
    mockDocSnap.exists.mockReturnValue(false);

    const result = await getUserProfile('user1');
    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    mockGetDoc.mockRejectedValue(new Error('Network error'));

    const result = await getUserProfile('user1');
    expect(result).toBeNull();
  });
});

// ========== addMealToFirestore ==========
describe('addMealToFirestore', () => {
  it('returns document id on success', async () => {
    const meal = { foodName: 'Salad', calories: 200 };
    const id = await addMealToFirestore('user1', meal);
    expect(id).toBe('newDoc1');
    expect(mockAddDoc).toHaveBeenCalled();
  });

  it('throws on error', async () => {
    mockAddDoc.mockRejectedValue(new Error('Write failed'));
    await expect(addMealToFirestore('user1', { foodName: 'X' })).rejects.toThrow('Write failed');
  });

  it('cleans NaN values via cleanData', async () => {
    const meal = { foodName: 'Test', calories: NaN, macros: { protein: NaN, fat: 10 } };
    await addMealToFirestore('user1', meal);

    const payload = mockAddDoc.mock.calls[0][1];
    expect(payload.calories).toBe(0);
    expect(payload.macros.protein).toBe(0);
    expect(payload.macros.fat).toBe(10);
  });

  it('cleans undefined values via cleanData', async () => {
    const meal = { foodName: 'Test', calories: 100, extra: undefined };
    await addMealToFirestore('user1', meal);

    const payload = mockAddDoc.mock.calls[0][1];
    // cleanData converts undefined to null (not removed)
    expect(payload.extra).toBeNull();
    expect(payload.foodName).toBe('Test');
  });

  it('sets image to null when missing', async () => {
    const meal = { foodName: 'Test', calories: 100 };
    await addMealToFirestore('user1', meal);

    const payload = mockAddDoc.mock.calls[0][1];
    expect(payload.image).toBeNull();
  });
});

// ========== getMealsFromFirestore ==========
describe('getMealsFromFirestore', () => {
  it('returns array of meals on success', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'm1', data: () => ({ foodName: 'Rice', calories: 300 }) },
        { id: 'm2', data: () => ({ foodName: 'Soup', calories: 100 }) },
      ],
    });

    const result = await getMealsFromFirestore('user1', 30);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'm1', foodName: 'Rice', calories: 300 });
  });

  it('returns empty array on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Firestore unavailable'));

    const result = await getMealsFromFirestore('user1');
    expect(result).toEqual([]);
  });
});

// ========== deleteMealFromFirestore ==========
describe('deleteMealFromFirestore', () => {
  it('completes successfully', async () => {
    await expect(deleteMealFromFirestore('user1', 'meal1')).resolves.toBeUndefined();
    expect(mockDeleteDoc).toHaveBeenCalled();
  });

  it('does not throw on error (catches internally)', async () => {
    mockDeleteDoc.mockRejectedValue(new Error('Delete failed'));
    await expect(deleteMealFromFirestore('user1', 'meal1')).resolves.toBeUndefined();
  });
});

// ========== updateMealInFirestore ==========
describe('updateMealInFirestore', () => {
  it('completes successfully with merge', async () => {
    await updateMealInFirestore('user1', 'meal1', { calories: 500 });
    expect(mockSetDoc).toHaveBeenCalledWith('docRef', expect.objectContaining({ calories: 500 }), { merge: true });
  });

  it('throws on error', async () => {
    mockSetDoc.mockRejectedValue(new Error('Update failed'));
    await expect(updateMealInFirestore('user1', 'meal1', {})).rejects.toThrow('Update failed');
  });
});

// ========== saveUserProfile ==========
describe('saveUserProfile', () => {
  it('saves profile with merge', async () => {
    await saveUserProfile('user1', { displayName: 'Test' });
    expect(mockSetDoc).toHaveBeenCalledWith('docRef', { displayName: 'Test' }, { merge: true });
  });
});

// ========== addWeightToFirestore ==========
describe('addWeightToFirestore', () => {
  it('saves weight with date-based document ID', async () => {
    const date = new Date('2025-01-15T10:00:00Z');
    await addWeightToFirestore('user1', 70.5, date);
    expect(mockSetDoc).toHaveBeenCalled();
    const payload = mockSetDoc.mock.calls[0][1];
    expect(payload.weight).toBe(70.5);
  });

  it('throws on error', async () => {
    mockSetDoc.mockRejectedValue(new Error('Weight save failed'));
    const date = new Date('2025-01-15T10:00:00Z');
    await expect(addWeightToFirestore('user1', 70, date)).rejects.toThrow('Weight save failed');
  });
});

// ========== getWeightsFromFirestore ==========
describe('getWeightsFromFirestore', () => {
  it('returns array of weights on success', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: '2025-01-15', data: () => ({ weight: 70.5, date: '2025-01-15' }) }],
    });

    const result = await getWeightsFromFirestore('user1');
    expect(result).toHaveLength(1);
    expect(result[0].weight).toBe(70.5);
  });

  it('returns empty array on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Fetch failed'));
    const result = await getWeightsFromFirestore('user1');
    expect(result).toEqual([]);
  });
});

// ========== getRecentMeals ==========
describe('getRecentMeals', () => {
  it('deduplicates by foodName', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'm1', data: () => ({ foodName: 'Ramen', calories: 600 }) },
        { id: 'm2', data: () => ({ foodName: 'Ramen', calories: 650 }) },
        { id: 'm3', data: () => ({ foodName: 'Salad', calories: 200 }) },
      ],
    });

    const result = await getRecentMeals('user1', 50);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.foodName)).toEqual(['Ramen', 'Salad']);
  });

  it('respects limitCount', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'm1', data: () => ({ foodName: 'A' }) },
        { id: 'm2', data: () => ({ foodName: 'B' }) },
        { id: 'm3', data: () => ({ foodName: 'C' }) },
      ],
    });

    const result = await getRecentMeals('user1', 2);
    expect(result).toHaveLength(2);
  });

  it('returns empty array on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Error'));
    const result = await getRecentMeals('user1');
    expect(result).toEqual([]);
  });
});

// ========== Stock Items ==========
describe('addStockItem', () => {
  it('adds item successfully', async () => {
    await addStockItem('user1', { name: 'Eggs' });
    expect(mockAddDoc).toHaveBeenCalled();
  });

  it('throws on error', async () => {
    mockAddDoc.mockRejectedValue(new Error('Stock add failed'));
    await expect(addStockItem('user1', { name: 'X' })).rejects.toThrow('Stock add failed');
  });
});

describe('getStockItems', () => {
  it('returns items on success', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 's1', data: () => ({ name: 'Milk' }) }],
    });
    const result = await getStockItems('user1');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Milk');
  });

  it('returns empty array on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Err'));
    const result = await getStockItems('user1');
    expect(result).toEqual([]);
  });
});

describe('deleteStockItem', () => {
  it('deletes successfully', async () => {
    await expect(deleteStockItem('user1', 'item1')).resolves.toBeUndefined();
  });

  it('throws on error', async () => {
    mockDeleteDoc.mockRejectedValue(new Error('Delete stock failed'));
    await expect(deleteStockItem('user1', 'item1')).rejects.toThrow('Delete stock failed');
  });
});

// ========== Recipes ==========
describe('addRecipeToFirestore', () => {
  it('adds recipe successfully', async () => {
    await addRecipeToFirestore('user1', { name: 'Curry', ingredients: ['rice'] });
    expect(mockAddDoc).toHaveBeenCalled();
  });

  it('throws on error', async () => {
    mockAddDoc.mockRejectedValue(new Error('Recipe add failed'));
    await expect(addRecipeToFirestore('user1', {})).rejects.toThrow('Recipe add failed');
  });
});

describe('getRecipesFromFirestore', () => {
  it('returns recipes on success', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 'r1', data: () => ({ name: 'Curry' }) }],
    });
    const result = await getRecipesFromFirestore('user1');
    expect(result).toHaveLength(1);
  });

  it('returns empty array on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Err'));
    const result = await getRecipesFromFirestore('user1');
    expect(result).toEqual([]);
  });
});

describe('deleteRecipeFromFirestore', () => {
  it('deletes successfully', async () => {
    await expect(deleteRecipeFromFirestore('user1', 'r1')).resolves.toBeUndefined();
  });

  it('does not throw on error', async () => {
    mockDeleteDoc.mockRejectedValue(new Error('Err'));
    await expect(deleteRecipeFromFirestore('user1', 'r1')).resolves.toBeUndefined();
  });
});

// ========== Game Scores ==========
describe('saveGameScore', () => {
  it('saves score successfully', async () => {
    await saveGameScore('user1', 'Daichi', 100, { streak: 5 });
    expect(mockAddDoc).toHaveBeenCalled();
  });

  it('does nothing when userId is falsy', async () => {
    await saveGameScore(null, 'Test', 100);
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('uses Anonymous when userName is missing', async () => {
    await saveGameScore('user1', '', 50);
    const payload = mockAddDoc.mock.calls[0][1];
    expect(payload.userName).toBe('Anonymous');
  });
});

describe('getLeaderboard', () => {
  it('returns scores on success', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 'g1', data: () => ({ score: 100 }) }],
    });
    const result = await getLeaderboard();
    expect(result).toHaveLength(1);
  });

  it('returns empty array on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Err'));
    const result = await getLeaderboard();
    expect(result).toEqual([]);
  });
});

describe('resetLeaderboard', () => {
  it('deletes all scores via batch', async () => {
    const docRef1 = { path: 'scores/1' };
    const docRef2 = { path: 'scores/2' };
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'g1', data: () => ({}), ref: docRef1 },
        { id: 'g2', data: () => ({}), ref: docRef2 },
      ],
    });

    await resetLeaderboard();
    expect(mockBatchDelete).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it('does not throw on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Err'));
    await expect(resetLeaderboard()).resolves.toBeUndefined();
  });
});

// ========== Daily Evaluation ==========
describe('saveDailyEvaluation', () => {
  it('saves evaluation successfully', async () => {
    await saveDailyEvaluation('user1', '2025-01-15', { score: 85 });
    expect(mockSetDoc).toHaveBeenCalled();
    const payload = mockSetDoc.mock.calls[0][1];
    expect(payload.score).toBe(85);
    expect(payload.dateKey).toBe('2025-01-15');
  });

  it('throws on error', async () => {
    mockSetDoc.mockRejectedValue(new Error('Save eval failed'));
    await expect(saveDailyEvaluation('user1', '2025-01-15', {})).rejects.toThrow('Save eval failed');
  });
});

describe('getDailyEvaluation', () => {
  it('returns evaluation when exists', async () => {
    mockDocSnap.exists.mockReturnValue(true);
    mockDocSnap.data.mockReturnValue({ score: 85, dateKey: '2025-01-15' });

    const result = await getDailyEvaluation('user1', '2025-01-15');
    expect(result).toEqual({ score: 85, dateKey: '2025-01-15' });
  });

  it('returns null when not exists', async () => {
    mockDocSnap.exists.mockReturnValue(false);
    const result = await getDailyEvaluation('user1', '2025-01-15');
    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    mockGetDoc.mockRejectedValue(new Error('Err'));
    const result = await getDailyEvaluation('user1', '2025-01-15');
    expect(result).toBeNull();
  });
});

// ========== Quiz ==========
describe('saveQuizToStock', () => {
  it('saves new quiz when no duplicate', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    await saveQuizToStock('user1', { question: 'What is PFC?' });
    expect(mockAddDoc).toHaveBeenCalled();
    const payload = mockAddDoc.mock.calls[0][1];
    expect(payload.correctCount).toBe(0);
    expect(payload.incorrectCount).toBe(0);
    expect(payload.lastShown).toBeNull();
  });

  it('skips duplicate questions', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [{ id: 'q1', data: () => ({ question: 'What is PFC?' }) }],
    });
    await saveQuizToStock('user1', { question: 'What is PFC?' });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });
});

describe('updateQuizResult', () => {
  it('increments correctCount on correct answer', async () => {
    mockDocSnap.exists.mockReturnValue(true);
    mockDocSnap.data.mockReturnValue({ correctCount: 2, incorrectCount: 1 });

    await updateQuizResult('user1', 'q1', true);
    expect(mockUpdateDoc).toHaveBeenCalledWith('docRef', expect.objectContaining({ correctCount: 3 }));
  });

  it('deletes quiz at 5 correct (mastery)', async () => {
    mockDocSnap.exists.mockReturnValue(true);
    mockDocSnap.data.mockReturnValue({ correctCount: 4, incorrectCount: 0 });

    await updateQuizResult('user1', 'q1', true);
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('increments incorrectCount on wrong answer', async () => {
    mockDocSnap.exists.mockReturnValue(true);
    mockDocSnap.data.mockReturnValue({ correctCount: 1, incorrectCount: 2 });

    await updateQuizResult('user1', 'q1', false);
    expect(mockUpdateDoc).toHaveBeenCalledWith('docRef', expect.objectContaining({ incorrectCount: 3 }));
  });

  it('does nothing when quiz not found', async () => {
    mockDocSnap.exists.mockReturnValue(false);
    await updateQuizResult('user1', 'q1', true);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });
});

describe('getQuizFromStock', () => {
  it('returns null when stock is empty', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const result = await getQuizFromStock('user1');
    expect(result).toBeNull();
  });

  it('prioritizes never-shown quizzes', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        { id: 'q1', data: () => ({ question: 'Q1', correctCount: 0, lastShown: { toMillis: () => 1000 } }) },
        { id: 'q2', data: () => ({ question: 'Q2', correctCount: 0, lastShown: null }) },
      ],
    });

    const result = await getQuizFromStock('user1');
    expect(result.question).toBe('Q2');
  });

  it('returns weighted random from seen quizzes when all have been shown', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        { id: 'q1', data: () => ({ question: 'Q1', correctCount: 1, incorrectCount: 0, lastShown: { toMillis: () => 1000, toDate: () => new Date() } }) },
        { id: 'q2', data: () => ({ question: 'Q2', correctCount: 0, incorrectCount: 3, lastShown: { toMillis: () => 500, toDate: () => new Date() } }) },
      ],
    });

    const result = await getQuizFromStock('user1');
    expect(result).not.toBeNull();
    expect(['Q1', 'Q2']).toContain(result.question);
  });

  it('returns null when all quizzes are mastered', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        { id: 'q1', data: () => ({ question: 'Q1', correctCount: 5, lastShown: { toMillis: () => 1000 } }) },
      ],
    });

    const result = await getQuizFromStock('user1');
    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Err'));
    const result = await getQuizFromStock('user1');
    expect(result).toBeNull();
  });
});

describe('getQuizStockCount', () => {
  it('returns count', async () => {
    mockGetDocs.mockResolvedValue({ size: 10, docs: [] });
    const count = await getQuizStockCount('user1');
    expect(count).toBe(10);
  });

  it('returns 0 on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Err'));
    const count = await getQuizStockCount('user1');
    expect(count).toBe(0);
  });
});

// ========== LINE Linking ==========
describe('saveLinkCode', () => {
  it('saves link code successfully', async () => {
    await saveLinkCode('user1', '123456');
    expect(mockAddDoc).toHaveBeenCalled();
    const payload = mockAddDoc.mock.calls[0][1];
    expect(payload.userId).toBe('user1');
    expect(payload.code).toBe('123456');
  });

  it('throws on error', async () => {
    mockAddDoc.mockRejectedValue(new Error('Link save failed'));
    await expect(saveLinkCode('user1', '123456')).rejects.toThrow('Link save failed');
  });
});

// ========== Search History ==========
describe('addSearchHistory', () => {
  it('does nothing when userId is missing', async () => {
    await addSearchHistory(null, { foodName: 'Test' });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('does nothing when item is missing', async () => {
    await addSearchHistory('user1', null);
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('does nothing when foodName is missing', async () => {
    await addSearchHistory('user1', { calories: 100 });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('adds new entry when no duplicate found', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    await addSearchHistory('user1', { foodName: 'Ramen', calories: 600, macros: { protein: 20 } });
    expect(mockAddDoc).toHaveBeenCalled();
  });

  it('updates existing entry when duplicate found', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [{ id: 'sh1', data: () => ({ foodName: 'Ramen' }) }],
    });

    await addSearchHistory('user1', { foodName: 'Ramen', calories: 650, macros: { protein: 22 } });
    expect(mockUpdateDoc).toHaveBeenCalled();
    expect(mockAddDoc).not.toHaveBeenCalled();
  });
});

describe('getSearchHistory', () => {
  it('returns empty array when no userId', async () => {
    const result = await getSearchHistory(null);
    expect(result).toEqual([]);
  });

  it('returns history on success', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 'sh1', data: () => ({ foodName: 'Sushi' }) }],
    });
    const result = await getSearchHistory('user1');
    expect(result).toHaveLength(1);
    expect(result[0].foodName).toBe('Sushi');
  });

  it('returns empty array on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Err'));
    const result = await getSearchHistory('user1');
    expect(result).toEqual([]);
  });
});
