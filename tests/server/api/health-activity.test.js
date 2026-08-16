import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFirebaseAdminMock } from '../../mocks/firebase-admin.js';
import { setupNextServerMock } from '../../mocks/next-server.js';

setupNextServerMock(vi);
const firebaseMocks = setupFirebaseAdminMock(vi);

const mockSubCollection = vi.fn();
const mockActivityDoc = vi.fn();

function createMockRequest({ token = 'test-token-123', body = {} } = {}) {
  const headers = new Headers();
  if (token !== undefined) headers.set('x-widget-token', token);

  return {
    headers,
    json: vi.fn().mockResolvedValue(body),
  };
}

async function loadPOST() {
  const mod = await import('@/app/api/health/activity/route.js');
  return mod.POST;
}

describe('POST /api/health/activity', () => {
  let POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.WIDGET_TOKEN = 'test-token-123';

    firebaseMocks.mockSet.mockResolvedValue(undefined);
    mockActivityDoc.mockReturnValue({ set: firebaseMocks.mockSet });
    mockSubCollection.mockImplementation((name) => {
      if (name === 'activityLogs') return { doc: mockActivityDoc };
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
    const res = await POST(createMockRequest({
      token: 'wrong-token',
      body: { uid: 'user1', steps: 1000 },
    }));

    expect(res.status).toBe(401);
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('returns 400 when uid is missing', async () => {
    const res = await POST(createMockRequest({ body: { steps: 1000 } }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Missing uid' });
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('returns 400 when no activity metric is included', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'user1', capturedAt: '2026-07-31T03:00:00Z' },
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No activity metrics' });
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('writes metrics to users/{uid}/activityLogs/{date} with merge true', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        steps: 8421,
        activeEnergy: 412,
        distanceKm: 6.2,
        flightsClimbed: 2,
        capturedAt: '2026-07-31T03:00:00Z',
      },
    }));

    expect(res.status).toBe(200);
    expect(mockSubCollection).toHaveBeenCalledWith('activityLogs');
    expect(mockActivityDoc).toHaveBeenCalledWith('2026-07-31');

    const [payload, options] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({
      steps: 8421,
      activeEnergy: 412,
      distanceKm: 6.2,
      flightsClimbed: 2,
      date: '2026-07-31',
      source: 'healthkit',
    }));
    expect(options).toEqual({ merge: true });
  });

  it('uses the JST date key when capturedAt is the next day in Asia/Tokyo', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'user1', steps: 100, capturedAt: '2026-07-30T16:00:00Z' },
    }));

    expect(res.status).toBe(200);
    expect(mockActivityDoc).toHaveBeenCalledWith('2026-07-31');
  });

  it('keeps 0 as 0 (a day with no steps is not a day without data)', async () => {
    await POST(createMockRequest({
      body: { uid: 'user1', steps: 0, capturedAt: '2026-07-31T03:00:00Z' },
    }));

    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload.steps).toBe(0);
  });

  it('stores out-of-range values as null instead of rejecting the whole request', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        steps: 8421,
        restingHeartRate: 900,   // ありえない値
        hrv: '',                 // ショートカットが取れなかった時の空文字
        capturedAt: '2026-07-31T03:00:00Z',
      },
    }));

    expect(res.status).toBe(200);
    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload.steps).toBe(8421);
    expect(payload.restingHeartRate).toBeNull();
    expect(payload.hrv).toBeNull();
  });

  it('does not touch metrics that were not sent', async () => {
    await POST(createMockRequest({
      body: { uid: 'user1', steps: 500, capturedAt: '2026-07-31T03:00:00Z' },
    }));

    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload).not.toHaveProperty('activeEnergy');
    expect(payload).not.toHaveProperty('exerciseMinutes');
  });

  it('accepts an explicit date, overriding capturedAt', async () => {
    await POST(createMockRequest({
      body: { uid: 'user1', steps: 500, date: '2026-07-25', capturedAt: '2026-07-31T03:00:00Z' },
    }));

    expect(mockActivityDoc).toHaveBeenCalledWith('2026-07-25');
  });
});
