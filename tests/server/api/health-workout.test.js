import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFirebaseAdminMock } from '../../mocks/firebase-admin.js';
import { setupNextServerMock } from '../../mocks/next-server.js';

setupNextServerMock(vi);
const firebaseMocks = setupFirebaseAdminMock(vi);

const mockSubCollection = vi.fn();
const mockWorkoutDoc = vi.fn();

function createMockRequest({ token = 'test-token-123', body = {} } = {}) {
  const headers = new Headers();
  if (token !== undefined) headers.set('x-widget-token', token);

  return {
    headers,
    json: vi.fn().mockResolvedValue(body),
  };
}

async function loadPOST() {
  const mod = await import('@/app/api/health/workout/route.js');
  return mod.POST;
}

const RUN = {
  type: 'running',
  typeLabel: 'ランニング',
  start: '2026-07-31T00:12:00.000Z',
  end: '2026-07-31T00:47:00.000Z',
  activeEnergy: 310,
  distanceKm: 5.1,
  avgHeartRate: 142,
};

describe('POST /api/health/workout', () => {
  let POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.WIDGET_TOKEN = 'test-token-123';

    firebaseMocks.mockSet.mockResolvedValue(undefined);
    mockWorkoutDoc.mockReturnValue({ set: firebaseMocks.mockSet });
    mockSubCollection.mockImplementation((name) => {
      if (name === 'workouts') return { doc: mockWorkoutDoc };
      return {};
    });
    firebaseMocks.mockDoc.mockReturnValue({ collection: mockSubCollection });
    firebaseMocks.mockCollection.mockImplementation((name) => {
      if (name === 'users') return { doc: firebaseMocks.mockDoc };
      return {};
    });

    POST = await loadPOST();
  });

  it('returns 401 with wrong token', async () => {
    const res = await POST(createMockRequest({ token: 'nope', body: { uid: 'user1', ...RUN } }));

    expect(res.status).toBe(401);
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('writes a single workout with derived duration and date keys', async () => {
    const res = await POST(createMockRequest({ body: { uid: 'user1', ...RUN } }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(expect.objectContaining({
      success: true, written: 1, skipped: 0,
    }));

    const [payload, options] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({
      type: 'running',
      typeLabel: 'ランニング',
      durationMinutes: 35,
      activeEnergy: 310,
      distanceKm: 5.1,
      avgHeartRate: 142,
      date: '2026-07-31',       // JST のカレンダー日
      logicalDate: '2026-07-31',
      source: 'healthkit',
    }));
    expect(options).toEqual({ merge: true });
  });

  it('uses the same document id for the same workout (idempotent re-send)', async () => {
    await POST(createMockRequest({ body: { uid: 'user1', ...RUN } }));
    const firstId = mockWorkoutDoc.mock.calls[0][0];

    await POST(createMockRequest({ body: { uid: 'user1', ...RUN } }));
    const secondId = mockWorkoutDoc.mock.calls[1][0];

    expect(secondId).toBe(firstId);
    // ドキュメントIDに使えない文字が残っていないこと
    expect(firstId).not.toMatch(/[/\\.#$[\]\s:]/);
  });

  it('accepts an array and skips invalid entries without failing the rest', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        workouts: [
          RUN,
          { type: 'walking' },                                  // start が無い
          { type: 'yoga', start: 'not-a-date', end: '2026-07-31T01:00:00Z' },
        ],
      },
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(expect.objectContaining({
      success: true, written: 1, skipped: 2,
    }));
  });

  it('returns 400 when nothing valid was sent', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'user1', workouts: [{ type: 'walking' }] },
    }));

    expect(res.status).toBe(400);
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('attributes a past-midnight workout to the previous logical day', async () => {
    // JST 7/31 1:30 開始 = 論理日 7/30（4:00 区切り）。カレンダー日は 7/31 のまま
    await POST(createMockRequest({
      body: {
        uid: 'user1',
        type: 'strength',
        start: '2026-07-30T16:30:00.000Z',
        end: '2026-07-30T17:10:00.000Z',
      },
    }));

    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload.date).toBe('2026-07-31');
    expect(payload.logicalDate).toBe('2026-07-30');
    expect(payload.durationMinutes).toBe(40);
  });
});
