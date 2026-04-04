import { describe, it, expect } from 'vitest';
import {
  ELENA_PROFILE,
  ELENA_VOICE,
  ELENA_STATUS,
  ELENA_EXPRESSIONS,
  ELENA_COACHING,
  ELENA_NG_RULES,
  ELENA_RELATIONSHIP_PHASES,
  ELENA_PERSONA_TEXT,
} from '@/data/elena-character';

describe('elena-character', () => {
  describe('ELENA_PROFILE', () => {
    it('has required profile fields', () => {
      expect(ELENA_PROFILE).toHaveProperty('fullName');
      expect(ELENA_PROFILE).toHaveProperty('age');
      expect(ELENA_PROFILE).toHaveProperty('origin');
      expect(ELENA_PROFILE).toHaveProperty('occupation');
    });

    it('has correct types', () => {
      expect(typeof ELENA_PROFILE.fullName).toBe('string');
      expect(typeof ELENA_PROFILE.age).toBe('number');
      expect(typeof ELENA_PROFILE.origin).toBe('string');
      expect(typeof ELENA_PROFILE.occupation).toBe('string');
    });
  });

  describe('ELENA_VOICE', () => {
    it('exists and has voice configuration', () => {
      expect(ELENA_VOICE).toBeDefined();
      expect(ELENA_VOICE).toHaveProperty('base');
      expect(ELENA_VOICE).toHaveProperty('firstPerson');
      expect(ELENA_VOICE).toHaveProperty('secondPerson');
      expect(ELENA_VOICE).toHaveProperty('mustUse');
      expect(ELENA_VOICE).toHaveProperty('mustAvoid');
    });
  });

  describe('ELENA_STATUS', () => {
    it('has all 5 statuses', () => {
      expect(ELENA_STATUS).toHaveProperty('NORMAL');
      expect(ELENA_STATUS).toHaveProperty('SCOLD');
      expect(ELENA_STATUS).toHaveProperty('LOGIC');
      expect(ELENA_STATUS).toHaveProperty('ENCOURAGE');
      expect(ELENA_STATUS).toHaveProperty('CHEER');
    });

    it('each status has label and description', () => {
      const statuses = Object.values(ELENA_STATUS);
      expect(statuses).toHaveLength(5);
      statuses.forEach((status) => {
        expect(status).toHaveProperty('label');
        expect(status).toHaveProperty('description');
        expect(typeof status.label).toBe('string');
        expect(typeof status.description).toBe('string');
      });
    });
  });

  describe('ELENA_EXPRESSIONS', () => {
    it('has 6 score ranges', () => {
      const ranges = Object.keys(ELENA_EXPRESSIONS);
      expect(ranges).toHaveLength(6);
    });

    it('each expression has image and mood', () => {
      Object.values(ELENA_EXPRESSIONS).forEach((expr) => {
        expect(expr).toHaveProperty('image');
        expect(expr).toHaveProperty('mood');
        expect(typeof expr.image).toBe('string');
        expect(typeof expr.mood).toBe('string');
      });
    });

    it('covers the full 0-100 range', () => {
      const ranges = Object.keys(ELENA_EXPRESSIONS);
      expect(ranges).toContain('0-20');
      expect(ranges).toContain('86-100');
    });
  });

  describe('ELENA_COACHING', () => {
    it('exists and has coaching scenarios', () => {
      expect(ELENA_COACHING).toHaveProperty('overCalories');
      expect(ELENA_COACHING).toHaveProperty('underCalories');
      expect(ELENA_COACHING).toHaveProperty('onTrack');
    });
  });

  describe('ELENA_NG_RULES', () => {
    it('is a non-empty array of strings', () => {
      expect(Array.isArray(ELENA_NG_RULES)).toBe(true);
      expect(ELENA_NG_RULES.length).toBeGreaterThan(0);
      ELENA_NG_RULES.forEach((rule) => {
        expect(typeof rule).toBe('string');
      });
    });
  });

  describe('ELENA_RELATIONSHIP_PHASES', () => {
    it('has phase definitions', () => {
      expect(ELENA_RELATIONSHIP_PHASES).toHaveProperty('encounter');
      expect(ELENA_RELATIONSHIP_PHASES).toHaveProperty('trust');
      expect(ELENA_RELATIONSHIP_PHASES).toHaveProperty('partner');
      expect(ELENA_RELATIONSHIP_PHASES).toHaveProperty('comrade');
    });
  });

  describe('ELENA_PERSONA_TEXT', () => {
    it('is a non-empty string', () => {
      expect(typeof ELENA_PERSONA_TEXT).toBe('string');
      expect(ELENA_PERSONA_TEXT.length).toBeGreaterThan(0);
    });

    it('contains key character elements', () => {
      expect(ELENA_PERSONA_TEXT).toContain('エレナ');
    });
  });
});
