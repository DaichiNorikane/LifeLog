/**
 * Tests for src/app/actions/condition-analysis.js
 *
 * 最重要の不変条件: AI にスコアを触らせない。数値の出所はエンジンだけ。
 */

const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  return { generateContent, createModel: vi.fn(() => ({ generateContent })) };
});

vi.mock('@/app/actions/gemini-client', () => ({
  apiKey: 'test-key',
  ELENA_PERSONA: 'エレナのペルソナ',
  HEALTH_DISCLAIMER_RULE: '# 健康に関する表現の制約（厳守）\n- 禁止: 診断',
  MODELS_TO_TRY: ['model-1', 'model-2'],
  THINKING: { OFF: 0, MEDIUM: 1024, DYNAMIC: -1 },
  getGenAI: vi.fn(() => ({ mocked: true })),
  createModel: mocks.createModel,
  CONDITION_ANALYSIS_SCHEMA: { name: 'condition-schema' },
  buildPrompt: (s, d) => `${String(s).trim()}\n\n${String(d).trim()}`,
}));

import { analyzeCondition } from '@/app/actions/condition-analysis';

const makeResponse = (json) => ({ response: { text: () => JSON.stringify(json) } });

const okPayload = {
  characterStatus: '[STATUS: LOGIC]',
  headline: '頭は冴えていますが、今夜が心配です…😢',
  axisComments: { focus: '朝食が効いています', sleep: 'カフェインが残ります', energy: null, mood: null },
  keyInsight: 'カフェインの半減期は約5時間あります。',
  tonightAction: '明日は14時までにしましょう🌙',
  reasoning: '睡眠が最も低いため。',
};

const engineResult = {
  date: '2026-07-29',
  axes: {
    focus: { score: 72, grade: 'good', confidence: 'high', drivers: [{ key: 'breakfast_protein', label: '朝食のタンパク質', delta: 8, detail: '朝食で25g' }] },
    sleep: { score: 38, grade: 'bad', confidence: 'high', drivers: [{ key: 'caffeine_late', label: '午後以降のカフェイン', delta: -12, detail: '14時以降に1回' }] },
    energy: { score: 61, grade: 'normal', confidence: 'medium', drivers: [] },
    mood: { score: null, grade: null, confidence: 'insufficient', drivers: [] },
  },
  topPositive: { axis: 'focus', key: 'breakfast_protein', label: '朝食のタンパク質', delta: 8 },
  topNegative: { axis: 'sleep', key: 'caffeine_late', label: '午後以降のカフェイン', delta: -12 },
  version: 1,
};

const context = {
  meals: [
    { foodName: '納豆ごはん', calories: 420, mealType: 'breakfast', timestamp: '2026-07-29T08:10:00+09:00' },
    { foodName: 'コーヒー', calories: 5, mealType: 'snack', timestamp: '2026-07-29T15:00:00+09:00' },
  ],
  conditionLog: { sleep: { subjective: 2 }, focus: { subjective: 4 } },
};

const promptOf = (call = 0) => mocks.generateContent.mock.calls[call][0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createModel.mockReturnValue({ generateContent: mocks.generateContent });
  mocks.generateContent.mockResolvedValue(makeResponse(okPayload));
});

describe('analyzeCondition', () => {
  it('returns the interpretation with the model name', async () => {
    const result = await analyzeCondition(engineResult, context);
    expect(result.headline).toBe(okPayload.headline);
    expect(result.model).toBe('model-1');
  });

  it('errors without an engine result（AI に丸投げしない）', async () => {
    expect(await analyzeCondition(null)).toEqual({ error: 'コンディションの計算結果がありません' });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  // --- スコアの出所はエンジンだけ ---
  it('discards any score the AI tries to invent', async () => {
    mocks.generateContent.mockResolvedValue(makeResponse({
      ...okPayload,
      score: 99,
      axes: { focus: { score: 10 } },
    }));

    const result = await analyzeCondition(engineResult, context);
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('axes');
  });

  it('tells the model not to recalculate the numbers', async () => {
    await analyzeCondition(engineResult, context);
    const prompt = promptOf();
    expect(prompt).toContain('数値を変更・再計算してはいけません');
    expect(prompt).toContain('変更・再計算は禁止');
  });

  // --- コスト設計 ---
  it('runs with thinking disabled（判断はエンジンが済ませているため）', async () => {
    await analyzeCondition(engineResult, context);
    const [, , , thinkingBudget] = mocks.createModel.mock.calls[0];
    expect(thinkingBudget).toBe(0);
  });

  it('puts the static instructions before the variable data（implicit caching のため）', async () => {
    await analyzeCondition(engineResult, context);
    const prompt = promptOf();

    const staticEnd = prompt.indexOf('# 出力フィールドの仕様');
    const dynamicStart = prompt.indexOf('# Data（ここから下が今日の実データ）');
    expect(staticEnd).toBeGreaterThan(-1);
    expect(dynamicStart).toBeGreaterThan(staticEnd);
    // ペルソナは必ず先頭側にある
    expect(prompt.indexOf('エレナのペルソナ')).toBeLessThan(dynamicStart);
  });

  it('keeps the static prefix identical across different days', async () => {
    await analyzeCondition(engineResult, context);
    const first = promptOf(0);

    mocks.generateContent.mockClear();
    await analyzeCondition(
      { ...engineResult, date: '2026-07-30', axes: { ...engineResult.axes, focus: { score: 40, grade: 'warn', confidence: 'high', drivers: [] } } },
      { meals: [], conditionLog: null }
    );
    const second = promptOf(0);

    const cut = (p) => p.slice(0, p.indexOf('# Data（ここから下が今日の実データ）'));
    expect(cut(first)).toBe(cut(second));
  });

  // --- プロンプトの中身 ---
  it('passes the engine scores and drivers verbatim', async () => {
    await analyzeCondition(engineResult, context);
    const prompt = promptOf();
    expect(prompt).toContain('集中力: 72点');
    expect(prompt).toContain('睡眠: 38点');
    expect(prompt).toContain('午後以降のカフェイン（14時以降に1回）: -12');
  });

  it('marks an insufficient axis so the AI does not invent a comment', async () => {
    await analyzeCondition(engineResult, context);
    expect(promptOf()).toContain('メンタル: 判定不可');
    expect(promptOf()).toContain('コメントは null にすること');
  });

  it('includes the medical expression guard', async () => {
    await analyzeCondition(engineResult, context);
    expect(promptOf()).toContain('健康に関する表現の制約');
  });

  it('lists meals with their JST times', async () => {
    await analyzeCondition(engineResult, context);
    const prompt = promptOf();
    expect(prompt).toContain('08:10 朝食: 納豆ごはん');
    expect(prompt).toContain('15:00 間食: コーヒー');
  });

  it('includes the subjective answers when present', async () => {
    await analyzeCondition(engineResult, context);
    expect(promptOf()).toContain('本人が答えた昨夜の眠り: 2/5');
  });

  it('says so when there is no subjective answer yet', async () => {
    await analyzeCondition(engineResult, { meals: [], conditionLog: null });
    expect(promptOf()).toContain('（まだ回答がありません）');
  });

  it('includes personalised findings only when provided', async () => {
    await analyzeCondition(engineResult, { ...context, findings: ['14時以降のコーヒーで睡眠評価が平均1.2下がる'] });
    const prompt = promptOf();
    expect(prompt).toContain('この人だけの傾向');
    expect(prompt).toContain('相関の観察です');
  });

  it('omits the findings block when there are none', async () => {
    await analyzeCondition(engineResult, context);
    expect(promptOf()).not.toContain('この人だけの傾向');
  });

  // --- 失敗時 ---
  it('falls back to the next model', async () => {
    mocks.generateContent
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(makeResponse(okPayload));

    const result = await analyzeCondition(engineResult, context);
    expect(result.model).toBe('model-2');
  });

  it('returns an error when every model fails', async () => {
    mocks.generateContent.mockRejectedValue(new Error('down'));
    const result = await analyzeCondition(engineResult, context);
    expect(result.error).toContain('コンディション解説の生成に失敗');
  });

  it('handles a malformed response as a failure', async () => {
    mocks.generateContent.mockResolvedValue({ response: { text: () => 'not json' } });
    const result = await analyzeCondition(engineResult, context);
    expect(result.error).toBeTruthy();
  });
});
