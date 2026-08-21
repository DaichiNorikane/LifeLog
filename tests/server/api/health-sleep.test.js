import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFirebaseAdminMock } from '../../mocks/firebase-admin.js';
import { setupNextServerMock } from '../../mocks/next-server.js';

setupNextServerMock(vi);
const firebaseMocks = setupFirebaseAdminMock(vi);

const mockConditionLogsCollection = vi.fn();
const mockLogDoc = vi.fn();
const mockLogGet = vi.fn();

// token: null を渡すとヘッダ自体を付けない（undefined はデフォルト値に化けるので使わない）
function createMockRequest({ token = 'test-token-123', body = {} } = {}) {
  const headers = new Headers();
  if (token !== null) headers.set('x-widget-token', token);

  return {
    headers,
    json: vi.fn().mockResolvedValue(body),
  };
}

async function loadPOST() {
  const mod = await import('@/app/api/health/sleep/route.js');
  return mod.POST;
}

/** 既存ドキュメントの中身を差し替える（主観入力の有無を切り替えるため） */
function setExistingLog(data) {
  mockLogGet.mockResolvedValue(
    data ? { exists: true, data: () => data } : { exists: false, data: () => null }
  );
}

describe('POST /api/health/sleep', () => {
  let POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.WIDGET_TOKEN = 'test-token-123';

    firebaseMocks.mockSet.mockResolvedValue(undefined);
    setExistingLog(null);
    mockLogDoc.mockReturnValue({ set: firebaseMocks.mockSet, get: mockLogGet });
    mockConditionLogsCollection.mockImplementation((name) => {
      if (name === 'conditionLogs') return { doc: mockLogDoc };
      return {};
    });
    firebaseMocks.mockDoc.mockReturnValue({ collection: mockConditionLogsCollection });
    firebaseMocks.mockCollection.mockImplementation((name) => {
      if (name === 'users') return { doc: firebaseMocks.mockDoc };
      return {};
    });

    POST = await loadPOST();
  });

  // --- 認証 ---
  it('returns 401 without token', async () => {
    const res = await POST(createMockRequest({ token: null, body: { uid: 'u1' } }));
    expect(res.status).toBe(401);
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('returns 401 with wrong token', async () => {
    const res = await POST(createMockRequest({ token: 'nope', body: { uid: 'u1' } }));
    expect(res.status).toBe(401);
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  // --- バリデーション ---
  it('returns 400 for invalid JSON body', async () => {
    const request = createMockRequest();
    request.json.mockRejectedValue(new Error('bad json'));

    const res = await POST(request);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 when uid is missing', async () => {
    const res = await POST(createMockRequest({ body: { sleepEnd: '2026-07-30T00:00:00Z' } }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Missing uid' });
  });

  // received は診断用。何が届いたのかを返さないと、実機のショートカットの設定ミスを追えない
  it('returns 400 when sleepEnd is missing', async () => {
    const res = await POST(createMockRequest({ body: { uid: 'u1' } }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing or invalid sleepEnd',
      received: null,
    });
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('returns 400 when sleepEnd is unparsable, echoing back what arrived', async () => {
    const res = await POST(createMockRequest({ body: { uid: 'u1', sleepEnd: 'last night' } }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing or invalid sleepEnd',
      received: 'last night',
    });
  });

  it('returns 400 when sleepStart is not before sleepEnd', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'u1',
        sleepStart: '2026-07-30T08:00:00+09:00',
        sleepEnd: '2026-07-30T08:00:00+09:00',
      },
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'sleepStart must be before sleepEnd' });
  });

  // --- 日付の帰属（この機能の肝） ---
  it('files sleep under the day whose meals caused it', async () => {
    // 7/30 の朝に起床 → 原因は 7/29 の食事 → 7/29 のログに保存
    const res = await POST(createMockRequest({
      body: { uid: 'u1', sleepEnd: '2026-07-30T08:00:00+09:00' },
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, date: '2026-07-29' });
    expect(mockLogDoc).toHaveBeenCalledWith('2026-07-29');
  });

  it('handles a nap ending before the 4am boundary', async () => {
    // 7/30 の 2:00 に起床＝論理日はまだ 7/29 → 直近で完了した夜は 7/28
    const res = await POST(createMockRequest({
      body: { uid: 'u1', sleepEnd: '2026-07-30T02:00:00+09:00' },
    }));

    expect(res.status).toBe(200);
    expect(mockLogDoc).toHaveBeenCalledWith('2026-07-28');
  });

  // --- 書き込み内容 ---
  it('writes objective sleep data with merge true', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'u1',
        sleepStart: '2026-07-30T01:10:00+09:00',
        sleepEnd: '2026-07-30T08:00:00+09:00',
        inBedMinutes: 420,
        asleepMinutes: 402,
        deepMinutes: 68,
        remMinutes: 91,
        awakenings: 2,
      },
    }));

    expect(res.status).toBe(200);
    expect(firebaseMocks.mockCollection).toHaveBeenCalledWith('users');
    expect(firebaseMocks.mockDoc).toHaveBeenCalledWith('u1');
    expect(mockConditionLogsCollection).toHaveBeenCalledWith('conditionLogs');

    const [payload, options] = firebaseMocks.mockSet.mock.calls[0];
    expect(options).toEqual({ merge: true });
    expect(payload.date).toBe('2026-07-29');
    expect(payload.sleep.source).toBe('healthkit');
    expect(payload.sleep.objective).toMatchObject({
      inBedMinutes: 420,
      asleepMinutes: 402,
      deepMinutes: 68,
      remMinutes: 91,
      awakenings: 2,
    });
  });

  it('stores missing metrics as null, not zero', async () => {
    await POST(createMockRequest({
      body: { uid: 'u1', sleepEnd: '2026-07-30T08:00:00+09:00', asleepMinutes: 400 },
    }));

    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload.sleep.objective.asleepMinutes).toBe(400);
    expect(payload.sleep.objective.deepMinutes).toBeNull();
    expect(payload.sleep.objective.remMinutes).toBeNull();
    expect(payload.sleep.objective.sleepStart).toBeNull();
  });

  it('rejects out-of-range metrics as null instead of storing garbage', async () => {
    await POST(createMockRequest({
      body: {
        uid: 'u1',
        sleepEnd: '2026-07-30T08:00:00+09:00',
        asleepMinutes: 5000,   // 24時間超
        deepMinutes: -10,      // 負値
      },
    }));

    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload.sleep.objective.asleepMinutes).toBeNull();
    expect(payload.sleep.objective.deepMinutes).toBeNull();
  });

  it('marks source as both when a subjective answer already exists', async () => {
    setExistingLog({ sleep: { subjective: 4 } });

    await POST(createMockRequest({
      body: { uid: 'u1', sleepEnd: '2026-07-30T08:00:00+09:00' },
    }));

    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload.sleep.source).toBe('both');
  });

  it('does not overwrite the subjective answer', async () => {
    setExistingLog({ sleep: { subjective: 4 } });

    await POST(createMockRequest({
      body: { uid: 'u1', sleepEnd: '2026-07-30T08:00:00+09:00' },
    }));

    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload.sleep).not.toHaveProperty('subjective');
  });

  it('returns 500 when the write fails', async () => {
    firebaseMocks.mockSet.mockRejectedValue(new Error('firestore down'));

    const res = await POST(createMockRequest({
      body: { uid: 'u1', sleepEnd: '2026-07-30T08:00:00+09:00' },
    }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Internal error' });
  });
});
