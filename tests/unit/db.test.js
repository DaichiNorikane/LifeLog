/**
 * Tests for src/utils/db.js
 * Uses fake-indexeddb (auto-polyfilled in setup.js)
 *
 * Note: Since initDB caches the dbPromise singleton, we test all operations
 * in a single import scope and use the module's own clear functions for cleanup.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  initDB,
  getCache,
  setCache,
  deleteCache,
  clearAllCache,
  addMeal,
  getAllMeals,
  deleteMealById,
  deleteAllMeals,
} from '@/utils/db';

describe('db (IndexedDB)', () => {
  // ---- initDB ----
  describe('initDB', () => {
    it('creates database successfully', async () => {
      const db = await initDB();
      expect(db).toBeDefined();
      expect(db.name).toBe('lifelog-db');
    });

    it('returns same instance on subsequent calls', async () => {
      const db1 = await initDB();
      const db2 = await initDB();
      expect(db1).toBe(db2);
    });
  });

  // ---- cache operations ----
  describe('cache operations', () => {
    it('setCache/getCache round-trip works', async () => {
      await setCache('test-key-rt', { value: 42 });
      const result = await getCache('test-key-rt');
      expect(result).not.toBeNull();
      expect(result.data).toEqual({ value: 42 });
      expect(result.stale).toBe(false);
      // cleanup
      await deleteCache('test-key-rt');
    });

    it('getCache returns null for missing key', async () => {
      const result = await getCache('nonexistent-key');
      expect(result).toBeNull();
    });

    it('getCache returns stale:true for old entries', async () => {
      await setCache('old-key', { value: 'old' });

      // Advance time beyond CACHE_TTL (5 minutes = 300000ms)
      const realDateNow = Date.now;
      Date.now = vi.fn().mockReturnValue(realDateNow() + 6 * 60 * 1000);

      const result = await getCache('old-key');
      expect(result).not.toBeNull();
      expect(result.stale).toBe(true);
      expect(result.data).toEqual({ value: 'old' });

      Date.now = realDateNow;
      await deleteCache('old-key');
    });

    it('deleteCache removes entry', async () => {
      await setCache('del-key', { value: 'delete me' });
      await deleteCache('del-key');
      const result = await getCache('del-key');
      expect(result).toBeNull();
    });

    it('clearAllCache removes all entries', async () => {
      await setCache('ca-key1', 'a');
      await setCache('ca-key2', 'b');
      await clearAllCache();
      const r1 = await getCache('ca-key1');
      const r2 = await getCache('ca-key2');
      expect(r1).toBeNull();
      expect(r2).toBeNull();
    });
  });

  // ---- meal operations ----
  describe('meal operations', () => {
    it('addMeal and getAllMeals work correctly', async () => {
      await deleteAllMeals(); // ensure clean state
      const meal = { id: 'meal-1', name: 'Ramen', calories: 850 };
      await addMeal(meal);
      const meals = await getAllMeals();
      expect(meals.length).toBeGreaterThanOrEqual(1);
      expect(meals.find(m => m.id === 'meal-1')).toEqual(meal);
      await deleteAllMeals();
    });

    it('deleteMealById removes specific meal', async () => {
      await deleteAllMeals();
      await addMeal({ id: 'meal-a', name: 'A' });
      await addMeal({ id: 'meal-b', name: 'B' });
      await deleteMealById('meal-a');
      const meals = await getAllMeals();
      expect(meals).toHaveLength(1);
      expect(meals[0].id).toBe('meal-b');
      await deleteAllMeals();
    });

    it('deleteAllMeals clears all meals', async () => {
      await addMeal({ id: 'meal-x', name: 'X' });
      await addMeal({ id: 'meal-y', name: 'Y' });
      await deleteAllMeals();
      const meals = await getAllMeals();
      expect(meals).toHaveLength(0);
    });
  });
});
