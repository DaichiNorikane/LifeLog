import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    constructor(apiKey) { this.apiKey = apiKey; }
    getGenerativeModel() { return {}; }
  },
}));

describe('gemini-client', () => {
  let extractJSON, extractJSONArray, getGenAI, MODELS_TO_TRY, ELENA_PERSONA;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/app/actions/gemini-client');
    extractJSON = mod.extractJSON;
    extractJSONArray = mod.extractJSONArray;
    getGenAI = mod.getGenAI;
    MODELS_TO_TRY = mod.MODELS_TO_TRY;
    ELENA_PERSONA = mod.ELENA_PERSONA;
  });

  // ---- extractJSON ----
  describe('extractJSON', () => {
    it('parses valid JSON object', () => {
      const result = extractJSON('{"name": "test", "value": 42}');
      expect(result).toEqual({ name: 'test', value: 42 });
    });

    it('extracts JSON from markdown code fences', () => {
      const input = '```json\n{"score": 85}\n```';
      expect(extractJSON(input)).toEqual({ score: 85 });
    });

    it('extracts nested JSON objects', () => {
      const input = '{"outer": {"inner": {"deep": true}}}';
      expect(extractJSON(input)).toEqual({ outer: { inner: { deep: true } } });
    });

    it('returns null for malformed JSON', () => {
      expect(extractJSON('no json here at all')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractJSON('')).toBeNull();
    });

    it('returns null for text with no JSON', () => {
      expect(extractJSON('This is just plain text without any JSON')).toBeNull();
    });

    it('extracts JSON embedded in surrounding text', () => {
      const input = 'Here is the result: {"calories": 500} and that is it.';
      expect(extractJSON(input)).toEqual({ calories: 500 });
    });
  });

  // ---- extractJSONArray ----
  describe('extractJSONArray', () => {
    it('parses valid JSON array', () => {
      const result = extractJSONArray('[{"id": 1}, {"id": 2}]');
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('extracts array from markdown code fences', () => {
      const input = '```json\n[1, 2, 3]\n```';
      expect(extractJSONArray(input)).toEqual([1, 2, 3]);
    });

    it('returns null for malformed array', () => {
      expect(extractJSONArray('[invalid')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractJSONArray('')).toBeNull();
    });
  });

  // ---- getGenAI ----
  describe('getGenAI', () => {
    it('returns null when no API key', async () => {
      delete process.env.GEMINI_API_KEY;
      vi.resetModules();
      const mod = await import('@/app/actions/gemini-client');
      expect(mod.getGenAI()).toBeNull();
    });

    it('returns instance when API key exists', async () => {
      process.env.GEMINI_API_KEY = 'test-api-key';
      vi.resetModules();
      const mod = await import('@/app/actions/gemini-client');
      const instance = mod.getGenAI();
      expect(instance).not.toBeNull();
      expect(instance).toBeDefined();
      delete process.env.GEMINI_API_KEY;
    });
  });

  // ---- MODELS_TO_TRY ----
  describe('MODELS_TO_TRY', () => {
    it('is an array with 4 models', () => {
      expect(Array.isArray(MODELS_TO_TRY)).toBe(true);
      expect(MODELS_TO_TRY).toHaveLength(4);
    });

    it('contains expected model names', () => {
      expect(MODELS_TO_TRY).toContain('gemini-2.0-flash');
      expect(MODELS_TO_TRY).toContain('gemini-1.5-flash');
    });
  });

  // ---- ELENA_PERSONA ----
  describe('ELENA_PERSONA', () => {
    it('is a non-empty string', () => {
      expect(typeof ELENA_PERSONA).toBe('string');
      expect(ELENA_PERSONA.length).toBeGreaterThan(0);
    });
  });
});
