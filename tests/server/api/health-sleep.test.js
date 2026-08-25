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

  // received は診断用。何が届いたのかを返さないと、実機のショートカットの設定ミスを追えない。
  // hint は届き方（行が無い / 空 / 読めない文字）ごとに別の対処を返す
  it('returns 400 when sleepEnd is missing', async () => {
    const res = await POST(createMockRequest({ body: { uid: 'u1' } }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing or invalid sleepEnd',
      received: null,
      hint: expect.stringContaining('sleepEnd の行'),
    });
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  // 実機で睡眠だけ入らなかった原因。検索0件は「データが無い」だけでなく
  // 「ショートカットに睡眠の読み取り許可が無い」でも起きる（どちらもエラーにならず空になる）。
  // 応答でその両方を言わないと、実機からは原因に辿り着けない
  it('hints at missing data or missing read permission when sleepEnd arrives blank', async () => {
    const res = await POST(createMockRequest({ body: { uid: 'u1', sleepEnd: '' } }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.received).toBe('');
    expect(json.hint).toContain('読み取り');
    expect(json.hint).toContain('睡眠スケジュール');
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('returns 400 when sleepEnd is unparsable, echoing back what arrived', async () => {
    const res = await POST(createMockRequest({ body: { uid: 'u1', sleepEnd: 'last night' } }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing or invalid sleepEnd',
      received: 'last night',
      hint: expect.stringContaining('終了日'),
    });
  });

  // 就寝側の検索が0件だと sleepStart だけが空で届く。ここで睡眠ごと捨てると
  // 読めている起床時刻まで失う（実機で睡眠だけ入らなかった原因と同じ構図）
  it('keeps the sleep record when sleepStart arrives empty', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'u1', sleepStart: '', sleepEnd: '2026-07-30T08:00:00+09:00' },
    }));

    expect(res.status).toBe(200);
    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload.sleep.objective.sleepStart).toBeNull();
    expect(payload.sleep.objective.sleepEnd).toBe('2026-07-29T23:00:00.000Z');
    // 就寝時刻が無ければ臥床時間は出せない。0 を作らず null のままにする
    expect(payload.sleep.objective.inBedMinutes).toBeNull();
  });

  it('keeps the sleep record when sleepStart arrives as an empty list', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'u1', sleepStart: [], sleepEnd: '2026-07-30T08:00:00+09:00' },
    }));

    expect(res.status).toBe(200);
    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload.sleep.objective.sleepStart).toBeNull();
  });

  // 空は「取れなかった」、読めない文字は「設定ミス」。後者は今まで通り弾く
  it('still rejects a non-empty unparsable sleepStart', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'u1', sleepStart: 'last night', sleepEnd: '2026-07-30T08:00:00+09:00' },
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid sleepStart',
      received: 'last night',
      hint: expect.stringContaining('開始日'),
    });
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
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
