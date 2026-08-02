import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  getLatestWeightBefore: vi.fn(),
  docGet: vi.fn(),
  whereGet: vi.fn(),
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  getJstDateId: () => '2026-08-02',
  getLatestWeightBefore: mocks.getLatestWeightBefore,
}));

vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: () => ({
      doc: () => ({
        collection: (name) => ({
          doc: () => ({ get: () => mocks.docGet(name) }),
          where: () => ({ limit: () => ({ get: () => mocks.whereGet(name) }) }),
        }),
      }),
    }),
  },
}));

import { handleBodyEvent, isBodyText } from '@/lib/line/handlers/body';

const event = {
  type: 'message',
  message: { id: 'msg-1', type: 'text', text: 'からだ' },
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
};

const user = { uid: 'uid-1', data: { targetWeight: 75 } };

const replyText = () => mocks.replyOrPushMessage.mock.calls[0][1].text;

const snapshot = (data) => ({ exists: data != null, data: () => data });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.docGet.mockImplementation((name) => {
    if (name === 'activityLogs') {
      return Promise.resolve(snapshot({ steps: 7864, activeEnergy: 304, distanceKm: 6.2 }));
    }
    if (name === 'conditionLogs') {
      return Promise.resolve(snapshot({
        sleep: {
          objective: {
            asleepMinutes: 402,
            sleepStart: '2026-08-01T14:10:00.000Z',
            sleepEnd: '2026-08-01T22:52:00.000Z',
          },
        },
      }));
    }
    return Promise.resolve(snapshot(null));
  });
  mocks.whereGet.mockResolvedValue({ docs: [] });
  mocks.getLatestWeightBefore.mockResolvedValue({
    weight: 83.4, bodyFat: 25.8, leanBodyMass: 61.5, bmi: 26.6,
  });
});

describe('isBodyText', () => {
  it.each(['からだ', 'カラダ', '体', '今日のからだ', '体調'])('matches %s', (text) => {
    expect(isBodyText(text)).toBe(true);
  });

  it('does not match meal logging that merely starts with から', () => {
    expect(isBodyText('からあげ食べた')).toBe(false);
    expect(isBodyText('体重 72.5')).toBe(false);
  });
});

describe('handleBodyEvent', () => {
  it('reports activity, sleep and body composition together', async () => {
    await handleBodyEvent(event, user);

    const text = replyText();
    expect(text).toContain('7,864');
    expect(text).toContain('6時間42分');
    expect(text).toContain('83.4kg');
    expect(text).toContain('体脂肪 25.8%');
  });

  it('derives the fat mass rather than expecting it to be stored', async () => {
    await handleBodyEvent(event, user);

    // 83.4kg × 25.8% = 21.52kg
    expect(replyText()).toContain('21.52kg');
  });

  it('shows how far the goal still is', async () => {
    await handleBodyEvent(event, user);

    expect(replyText()).toContain('あと 8.4kg');
  });

  it('celebrates once the goal is reached', async () => {
    mocks.getLatestWeightBefore.mockResolvedValue({ weight: 74, bodyFat: null });

    await handleBodyEvent(event, user);

    expect(replyText()).toContain('目標を達成');
  });

  it('lists the workouts of the day', async () => {
    mocks.whereGet.mockResolvedValue({
      docs: [{ data: () => ({ typeLabel: 'ランニング', durationMinutes: 35, distanceKm: 5.1, activeEnergy: 310 }) }],
    });

    await handleBodyEvent(event, user);

    expect(replyText()).toContain('ランニング 35分');
    expect(replyText()).toContain('310kcal');
  });

  it('explains what to do when nothing has synced yet', async () => {
    mocks.docGet.mockResolvedValue(snapshot(null));
    mocks.getLatestWeightBefore.mockResolvedValue(null);

    const result = await handleBodyEvent(event, user);

    expect(result.empty).toBe(true);
    expect(replyText()).toContain('ショートカット');
  });

  it('still answers when only part of the data arrived', async () => {
    mocks.docGet.mockImplementation((name) =>
      Promise.resolve(name === 'activityLogs' ? snapshot({ steps: 500 }) : snapshot(null)));
    mocks.getLatestWeightBefore.mockResolvedValue(null);

    await handleBodyEvent(event, user);

    expect(replyText()).toContain('500');
    expect(replyText()).not.toContain('睡眠');
  });
});
