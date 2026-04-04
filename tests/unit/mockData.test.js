import { describe, it, expect } from 'vitest';
import { mockDatabase, getMockResult } from '@/utils/mockData';

describe('mockData', () => {
  describe('mockDatabase', () => {
    it('has 5 items', () => {
      expect(mockDatabase).toHaveLength(5);
    });

    it('each item has required fields', () => {
      mockDatabase.forEach((item) => {
        expect(item).toHaveProperty('foodName');
        expect(item).toHaveProperty('calories');
        expect(item).toHaveProperty('macros');
        expect(item).toHaveProperty('breakdown');
        expect(item).toHaveProperty('reasoning');
      });
    });

    it('each item has macros with protein, fat, carbs', () => {
      mockDatabase.forEach((item) => {
        expect(item.macros).toHaveProperty('protein');
        expect(item.macros).toHaveProperty('fat');
        expect(item.macros).toHaveProperty('carbs');
      });
    });
  });

  describe('getMockResult', () => {
    it('returns deterministic result based on file size', () => {
      const file = { size: 10 };
      const result1 = getMockResult(file);
      const result2 = getMockResult(file);
      expect(result1.foodName).toBe(result2.foodName);
      expect(result1.calories).toBe(result2.calories);
    });

    it('result has confidence between 0.9 and 0.99', () => {
      const file = { size: 100 };
      const result = getMockResult(file);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.confidence).toBeLessThan(1.0);
    });

    it('different file sizes can return different items', () => {
      // size 0 => index 0, size 1 => index 1
      const result0 = getMockResult({ size: 0 });
      const result1 = getMockResult({ size: 1 });
      expect(result0.foodName).not.toBe(result1.foodName);
    });

    it('uses modulo to wrap around database', () => {
      // size 5 % 5 = 0, same as size 0
      const resultA = getMockResult({ size: 0 });
      const resultB = getMockResult({ size: 5 });
      expect(resultA.foodName).toBe(resultB.foodName);
    });

    it('result includes all original fields plus confidence', () => {
      const file = { size: 2 };
      const result = getMockResult(file);
      expect(result).toHaveProperty('foodName');
      expect(result).toHaveProperty('calories');
      expect(result).toHaveProperty('macros');
      expect(result).toHaveProperty('breakdown');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('confidence');
    });
  });
});
