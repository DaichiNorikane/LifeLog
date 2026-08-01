import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateUserProfileAdmin: vi.fn().mockResolvedValue({}),
  getRecentAverageCaloriesAdmin: vi.fn().mockResolvedValue(1900),
  getLatestWeightBefore: vi.fn().mockResolvedValue({ weight: 83.4 }),
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  analyzeGoalFeasibility: vi.fn(),
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  updateUserProfileAdmin: mocks.updateUserProfileAdmin,
  getRecentAverageCaloriesAdmin: mocks.getRecentAverageCaloriesAdmin,
  getLatestWeightBefore: mocks.getLatestWeightBefore,
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/app/actions/daily-evaluation', () => ({
  analyzeGoalFeasibility: mocks.analyzeGoalFeasibility,
}));

import { handleGoalEvent, isGoalText, parseGoalCommand } from '@/lib/line/handlers/goal';

const event = {
  type: 'message',
  message: { id: 'msg-1', type: 'text', text: '目標' },
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
};

const user = {
  uid: 'uid-1',
  data: { targetWeight: 75, targetDate: '2026-12-31', targetCalories: 2000, height: 177 },
};

const replyText = () => mocks.replyOrPushMessage.mock.calls[0][1].text;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLatestWeightBefore.mockResolvedValue({ weight: 83.4 });
  mocks.getRecentAverageCaloriesAdmin.mockResolvedValue(1900);
});

describe('parseGoalCommand', () => {
  it.each(['目標', '目標は', 'ダイエット目標', '目標は？', '目標を教えて'])(
    'treats %s as a request to show the goal', (text) => {
      expect(parseGoalCommand(text)).toEqual({ action: 'show' });
    });

  it.each(['目標診断', '目標を診断して', 'ダイエット目標診断'])(
    'treats %s as a diagnosis request', (text) => {
      expect(parseGoalCommand(text)).toEqual({ action: 'diagnose' });
    });

  it('parses a target calorie change', () => {
    expect(parseGoalCommand('目標カロリー 1800')).toEqual({
      action: 'set', patch: { targetCalories: 1800 },
    });
    expect(parseGoalCommand('摂取カロリー1800')).toEqual({
      action: 'set', patch: { targetCalories: 1800 },
    });
  });

  it('parses full width digits', () => {
    expect(parseGoalCommand('目標カロリー　１８００')).toEqual({
      action: 'set', patch: { targetCalories: 1800 },
    });
  });

  it('parses a target weight change', () => {
    expect(parseGoalCommand('目標体重 75')).toEqual({
      action: 'set', patch: { targetWeight: 75 },
    });
    expect(parseGoalCommand('目標体重を74.5')).toEqual({
      action: 'set', patch: { targetWeight: 74.5 },
    });
  });

  it('parses a deadline in both formats', () => {
    expect(parseGoalCommand('目標日 2026-12-31')).toEqual({
      action: 'set', patch: { targetDate: '2026-12-31' },
    });
    expect(parseGoalCommand('期限 3/9').patch.targetDate).toMatch(/^\d{4}-03-09$/);
  });

  it('accepts several changes in one message', () => {
    expect(parseGoalCommand('目標体重 75 目標カロリー 1800')).toEqual({
      action: 'set', patch: { targetCalories: 1800, targetWeight: 75 },
    });
  });

  it('rejects values that are almost certainly a mistake', () => {
    expect(parseGoalCommand('目標カロリー 100')).toBeNull();
    expect(parseGoalCommand('目標カロリー 99999')).toBeNull();
    expect(parseGoalCommand('目標体重 500')).toBeNull();
  });

  it('does not hijack ordinary messages', () => {
    expect(parseGoalCommand('ラーメン食べた')).toBeNull();
    expect(parseGoalCommand('今日のカロリー')).toBeNull();
    expect(parseGoalCommand('72.5')).toBeNull();
    expect(parseGoalCommand('体重 72.5')).toBeNull();
    expect(isGoalText('おはよう')).toBe(false);
  });
});

describe('handleGoalEvent — show', () => {
  it('reports every part of the goal and how to change it', async () => {
    await handleGoalEvent(event, user, { action: 'show' });

    const text = replyText();
    expect(text).toContain('75kg');
    expect(text).toContain('2026-12-31');
    expect(text).toContain('2000kcal');
    expect(text).toContain('目標カロリー 1800');
  });

  it('shows how much is left based on the latest measured weight', async () => {
    await handleGoalEvent(event, user, { action: 'show' });

    expect(replyText()).toContain('あと 8.4kg');
  });

  it('says 未設定 rather than hiding an unset goal', async () => {
    await handleGoalEvent(event, { uid: 'uid-1', data: {} }, { action: 'show' });

    const text = replyText();
    expect(text).toContain('目標体重: 未設定');
    expect(text).toContain('目標カロリー: 未設定');
  });
});

describe('handleGoalEvent — set', () => {
  it('saves the change and echoes the resulting goal', async () => {
    await handleGoalEvent(event, user, { action: 'set', patch: { targetCalories: 1800 } });

    expect(mocks.updateUserProfileAdmin).toHaveBeenCalledWith('uid-1', { targetCalories: 1800 });
    const text = replyText();
    expect(text).toContain('1800kcal');
    expect(text).toContain('変更しました');
  });

  it('keeps the untouched parts of the goal in the confirmation', async () => {
    await handleGoalEvent(event, user, { action: 'set', patch: { targetCalories: 1800 } });

    expect(replyText()).toContain('75kg');
  });
});

describe('handleGoalEvent — diagnose', () => {
  it('runs the diagnosis with the measured weight and recent intake', async () => {
    mocks.analyzeGoalFeasibility.mockResolvedValue({
      feasibility: 'Realistic',
      reasoning: 'いいペースです',
      recommended_daily_calories: 1850,
    });

    await handleGoalEvent(event, user, { action: 'diagnose' });

    expect(mocks.analyzeGoalFeasibility).toHaveBeenCalledWith(expect.objectContaining({
      currentWeight: 83.4,
      targetWeight: 75,
      targetDate: '2026-12-31',
      recentCalories: 1900,
    }));

    const text = replyText();
    expect(text).toContain('適正ライン');
    expect(text).toContain('1850kcal');
    // そのまま採用できる導線を必ず添える
    expect(text).toContain('目標カロリー 1850');
  });

  it('saves the diagnosis so the app shows the same result', async () => {
    mocks.analyzeGoalFeasibility.mockResolvedValue({ feasibility: 'Easy', reasoning: 'ok' });

    await handleGoalEvent(event, user, { action: 'diagnose' });

    expect(mocks.updateUserProfileAdmin).toHaveBeenCalledWith('uid-1', {
      lastDiagnosis: expect.objectContaining({ feasibility: 'Easy' }),
    });
  });

  it('asks for the missing pieces instead of guessing', async () => {
    await handleGoalEvent(event, { uid: 'uid-1', data: {} }, { action: 'diagnose' });

    expect(mocks.analyzeGoalFeasibility).not.toHaveBeenCalled();
    expect(replyText()).toContain('必要です');
  });

  it('strips markup from the reasoning before sending it as plain text', async () => {
    mocks.analyzeGoalFeasibility.mockResolvedValue({
      feasibility: 'Strict',
      reasoning: '<b>きついです</b><br>頑張りましょう',
    });

    await handleGoalEvent(event, user, { action: 'diagnose' });

    expect(replyText()).not.toContain('<b>');
    expect(replyText()).toContain('きついです');
  });

  it('reports failure rather than staying silent', async () => {
    mocks.analyzeGoalFeasibility.mockResolvedValue({ error: 'API down' });

    await handleGoalEvent(event, user, { action: 'diagnose' });

    expect(replyText()).toContain('診断に失敗しました');
  });
});
