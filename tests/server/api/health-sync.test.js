import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFirebaseAdminMock } from '../../mocks/firebase-admin.js';
import { setupNextServerMock } from '../../mocks/next-server.js';

setupNextServerMock(vi);
const firebaseMocks = setupFirebaseAdminMock(vi);

// コレクションごとに set を分けて記録する（どのドメインが書けたかを検証するため）
const setCalls = {
  weights: vi.fn().mockResolvedValue(undefined),
  activityLogs: vi.fn().mockResolvedValue(undefined),
  workouts: vi.fn().mockResolvedValue(undefined),
  conditionLogs: vi.fn().mockResolvedValue(undefined),
};

function createMockRequest({ token = 'test-token-123', body = {} } = {}) {
  const headers = new Headers();
  if (token !== undefined) headers.set('x-widget-token', token);

  return {
    headers,
    json: vi.fn().mockResolvedValue(body),
  };
}

async function loadPOST() {
  const mod = await import('@/app/api/health/sync/route.js');
  return mod.POST;
}

describe('POST /api/health/sync', () => {
  let POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.WIDGET_TOKEN = 'test-token-123';

    for (const fn of Object.values(setCalls)) fn.mockResolvedValue(undefined);

    firebaseMocks.mockDoc.mockReturnValue({
      collection: (name) => ({
        doc: () => ({
          set: setCalls[name] || vi.fn().mockResolvedValue(undefined),
          // 睡眠は既存ドキュメントを読んでから書く
          get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        }),
      }),
    });
    firebaseMocks.mockCollection.mockImplementation((name) => {
      if (name === 'users') return { doc: firebaseMocks.mockDoc };
      return {};
    });

    POST = await loadPOST();
  });

  it('returns 401 with wrong token', async () => {
    const res = await POST(createMockRequest({
      token: 'nope',
      body: { uid: 'user1', activity: { steps: 100 } },
    }));

    expect(res.status).toBe(401);
  });

  it('returns 400 when uid is missing', async () => {
    const res = await POST(createMockRequest({ body: { activity: { steps: 100 } } }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Missing uid' });
  });

  it('returns 400 when no domain is present', async () => {
    const res = await POST(createMockRequest({ body: { uid: 'user1' } }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No data' });
  });

  it('writes every domain included in one request', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        capturedAt: '2026-07-31T03:00:00Z',
        weight: { weight: 82.6, bodyFat: 25.8, bmi: 26.3, leanBodyMass: 61.3, height: 177, measuredAt: '2026-07-31T03:00:00Z' },
        activity: { steps: 8421, activeEnergy: 59.2 },
        workouts: [{ type: 'walking', start: '2026-07-31T00:00:00Z', end: '2026-07-31T00:30:00Z' }],
        sleep: { sleepStart: '2026-07-30T16:00:00Z', sleepEnd: '2026-07-30T23:00:00Z', asleepMinutes: 402 },
      },
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.results.weight.ok).toBe(true);
    expect(json.results.activity.ok).toBe(true);
    expect(json.results.workouts).toEqual(expect.objectContaining({ ok: true, written: 1 }));
    expect(json.results.sleep.ok).toBe(true);

    expect(setCalls.weights).toHaveBeenCalledTimes(1);
    expect(setCalls.activityLogs).toHaveBeenCalledTimes(1);
    expect(setCalls.workouts).toHaveBeenCalledTimes(1);
    expect(setCalls.conditionLogs).toHaveBeenCalledTimes(1);
  });

  it('keeps writing other domains when one is invalid (partial success)', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        weight: { bodyFat: 25.8 },        // weight が無い → 失敗
        activity: { steps: 8421 },        // こちらは書ける
        capturedAt: '2026-07-31T03:00:00Z',
      },
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.results.weight).toEqual({ ok: false, error: 'Missing weight' });
    expect(json.results.activity.ok).toBe(true);
    expect(setCalls.activityLogs).toHaveBeenCalledTimes(1);
    expect(setCalls.weights).not.toHaveBeenCalled();
  });

  it('keeps writing other domains when one throws', async () => {
    setCalls.weights.mockRejectedValueOnce(new Error('firestore down'));

    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        weight: { weight: 82.6, measuredAt: '2026-07-31T03:00:00Z' },
        activity: { steps: 8421 },
        capturedAt: '2026-07-31T03:00:00Z',
      },
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results.weight).toEqual({ ok: false, error: 'Internal error' });
    expect(json.results.activity.ok).toBe(true);
  });

  it('returns 500 when every domain failed', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        weight: { bodyFat: 25.8 },
        sleep: { asleepMinutes: 400 },   // sleepEnd が無い
      },
    }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  // --- 平らな形（iOSショートカットのJSON入力は入れ子を作るのが難しい）---

  it('accepts metrics placed flat at the top level', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        capturedAt: '2026-07-31T03:00:00Z',
        steps: 8421,
        activeEnergy: 59.2,
        weight: 82.6,
        bodyFat: 25.8,
        bmi: 26.3,
        leanBodyMass: 61.3,
        height: 177,
      },
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results.activity.ok).toBe(true);
    expect(json.results.weight.ok).toBe(true);

    const [activityPayload] = setCalls.activityLogs.mock.calls[0];
    expect(activityPayload).toEqual(expect.objectContaining({ steps: 8421, activeEnergy: 59.2 }));

    const [weightPayload] = setCalls.weights.mock.calls[0];
    expect(weightPayload).toEqual(expect.objectContaining({
      weight: 82.6, bodyFat: 25.8, bmi: 26.3, leanBodyMass: 61.3, height: 177,
    }));
  });

  it('accepts flat metrics sent as strings (Shortcuts sends text)', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'user1', steps: '8421', weight: '82.6', bodyFat: '', capturedAt: '2026-07-31T03:00:00Z' },
    }));

    expect(res.status).toBe(200);

    const [activityPayload] = setCalls.activityLogs.mock.calls[0];
    expect(activityPayload.steps).toBe(8421);

    const [weightPayload] = setCalls.weights.mock.calls[0];
    expect(weightPayload.weight).toBe(82.6);
    // 取れなかった項目は空文字で届く。0 ではなく null として保存する
    expect(weightPayload.bodyFat).toBeNull();
  });

  it('still treats weight as body composition when nested, not as a flat metric', async () => {
    await POST(createMockRequest({
      body: {
        uid: 'user1',
        weight: { weight: 70.1, bodyFat: 20 },
        steps: 500,
        capturedAt: '2026-07-31T03:00:00Z',
      },
    }));

    const [weightPayload] = setCalls.weights.mock.calls[0];
    expect(weightPayload.weight).toBe(70.1);
    expect(weightPayload.bodyFat).toBe(20);
  });

  it('ignores flat body metrics when weight itself is missing', async () => {
    // 体重が無いまま体脂肪率だけ来ても、体組成の記録としては成立しない
    const res = await POST(createMockRequest({
      body: { uid: 'user1', bodyFat: 25.8, steps: 500, capturedAt: '2026-07-31T03:00:00Z' },
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results.activity.ok).toBe(true);
    expect(json.results.weight).toBeUndefined();
    expect(setCalls.weights).not.toHaveBeenCalled();
  });

  it('accepts sleep placed flat at the top level', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        sleepStart: '2026-08-01T14:10:00Z',
        sleepEnd: '2026-08-01T22:52:00Z',
      },
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results.sleep.ok).toBe(true);
    expect(setCalls.conditionLogs).toHaveBeenCalledTimes(1);

    const [payload] = setCalls.conditionLogs.mock.calls[0];
    // 就寝〜起床の時刻だけ送れば臥床時間が出る（ショートカットは合計を出せない）
    expect(payload.sleep.objective.inBedMinutes).toBe(522);
    // 実際に眠っていた時間は推測できないので補わない
    expect(payload.sleep.objective.asleepMinutes).toBeNull();
  });

  it('prefers a measured asleep duration over the derived span', async () => {
    await POST(createMockRequest({
      body: {
        uid: 'user1',
        sleepStart: '2026-08-01T14:10:00Z',
        sleepEnd: '2026-08-01T22:52:00Z',
        inBedMinutes: '500',
        asleepMinutes: '402',
      },
    }));

    const [payload] = setCalls.conditionLogs.mock.calls[0];
    expect(payload.sleep.objective.inBedMinutes).toBe(500);
    expect(payload.sleep.objective.asleepMinutes).toBe(402);
  });

  // 起床側の検索だけが直っても、就寝側が空の日は必ず出る。
  // そこで睡眠ごと 400 にすると「直したのにまだ入らない」に逆戻りする
  it('saves the wake time even when the bedtime search returned nothing', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        steps: 8421,
        sleepStart: '',
        sleepEnd: '2026-08-01T22:52:00Z',
      },
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results.sleep.ok).toBe(true);
    expect(json.results.activity.ok).toBe(true);

    const [payload] = setCalls.conditionLogs.mock.calls[0];
    expect(payload.sleep.objective.sleepStart).toBeNull();
    expect(payload.sleep.objective.inBedMinutes).toBeNull();
  });

  // 実機で睡眠だけ落ち続けた形。received が空文字なら「ヘルスケアに睡眠が無い」と一目で分かる
  it('echoes an empty received when the wake time arrives blank', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'user1', steps: 8421, sleepEnd: '' },
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results.sleep).toEqual({
      ok: false,
      error: 'Missing or invalid sleepEnd',
      received: '',
    });
    expect(json.results.activity.ok).toBe(true);
    expect(setCalls.conditionLogs).not.toHaveBeenCalled();
  });

  it('does not treat sleep as present without an end time', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'user1', sleepStart: '2026-08-01T14:10:00Z', steps: 100 },
    }));

    const json = await res.json();
    expect(json.results.sleep).toBeUndefined();
    expect(setCalls.conditionLogs).not.toHaveBeenCalled();
  });

  it('returns 400 when only unknown keys are sent', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'user1', somethingElse: 123 },
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No data' });
  });

  it('normalizes a body fat ratio (0.258) into a percentage', async () => {
    await POST(createMockRequest({
      body: {
        uid: 'user1',
        weight: { weight: 82.6, bodyFat: 0.258, measuredAt: '2026-07-31T03:00:00Z' },
      },
    }));

    const [payload] = setCalls.weights.mock.calls[0];
    expect(payload.bodyFat).toBe(25.8);
  });
});
