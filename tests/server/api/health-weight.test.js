import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFirebaseAdminMock } from '../../mocks/firebase-admin.js';
import { setupNextServerMock } from '../../mocks/next-server.js';

setupNextServerMock(vi);
const firebaseMocks = setupFirebaseAdminMock(vi);

const mockUserWeightsCollection = vi.fn();
const mockWeightDoc = vi.fn();

function createMockRequest({ token = 'test-token-123', body = {} } = {}) {
  const headers = new Headers();
  if (token !== undefined) headers.set('x-widget-token', token);

  return {
    headers,
    json: vi.fn().mockResolvedValue(body),
  };
}

async function loadPOST() {
  const mod = await import('@/app/api/health/weight/route.js');
  return mod.POST;
}

describe('POST /api/health/weight', () => {
  let POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.WIDGET_TOKEN = 'test-token-123';

    firebaseMocks.mockSet.mockResolvedValue(undefined);
    mockWeightDoc.mockReturnValue({ set: firebaseMocks.mockSet });
    mockUserWeightsCollection.mockImplementation((name) => {
      if (name === 'weights') return { doc: mockWeightDoc };
      return {};
    });
    firebaseMocks.mockDoc.mockReturnValue({
      collection: mockUserWeightsCollection,
    });
    firebaseMocks.mockCollection.mockImplementation((name) => {
      if (name === 'users') return { doc: firebaseMocks.mockDoc };
      return {};
    });

    POST = await loadPOST();
  });

  it('returns 401 with wrong token', async () => {
    const res = await POST(createMockRequest({
      token: 'wrong-token',
      body: { uid: 'user1', weight: 65.2 },
    }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('returns 400 when uid is missing', async () => {
    const res = await POST(createMockRequest({
      body: { weight: 65.2 },
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Missing uid' });
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('returns 400 when weight is missing', async () => {
    const res = await POST(createMockRequest({
      body: { uid: 'user1' },
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Missing weight' });
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['too high', 500],
    ['non numeric', 'heavy'],
  ])('returns 400 for invalid weight: %s', async (_label, weight) => {
    const res = await POST(createMockRequest({
      body: { uid: 'user1', weight },
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid weight' });
    expect(firebaseMocks.mockSet).not.toHaveBeenCalled();
  });

  it('writes all health fields to users/{uid}/weights/{date} with merge true', async () => {
    const measuredAt = '2026-07-14T03:30:00.000Z';

    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        weight: 65.2,
        bodyFat: 23.4,
        bmi: 22.6,
        leanBodyMass: 50.1,
        measuredAt,
      },
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      date: '2026-07-14',
      weight: 65.2,
      bodyFat: 23.4,
      bmi: 22.6,
      leanBodyMass: 50.1,
    });

    expect(firebaseMocks.mockCollection).toHaveBeenCalledWith('users');
    expect(firebaseMocks.mockDoc).toHaveBeenCalledWith('user1');
    expect(mockUserWeightsCollection).toHaveBeenCalledWith('weights');
    expect(mockWeightDoc).toHaveBeenCalledWith('2026-07-14');
    expect(firebaseMocks.mockSet).toHaveBeenCalledWith({
      weight: 65.2,
      bodyFat: 23.4,
      bmi: 22.6,
      leanBodyMass: 50.1,
      date: '2026-07-14',
      timestamp: measuredAt,
      updatedAt: expect.anything(),
      source: 'healthkit',
    }, { merge: true });
  });

  it('stores omitted body composition fields as null', async () => {
    const measuredAt = '2026-07-14T08:00:00.000Z';

    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        weight: 66.1,
        measuredAt,
      },
    }));

    expect(res.status).toBe(200);

    const [payload, options] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({
      weight: 66.1,
      bodyFat: null,
      bmi: null,
      leanBodyMass: null,
      date: '2026-07-14',
      timestamp: measuredAt,
      source: 'healthkit',
    }));
    expect(options).toEqual({ merge: true });
  });

  it('keeps bodyFat 0 as 0 (not null)', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        weight: 66.1,
        bodyFat: 0,
        measuredAt: '2026-07-14T08:00:00.000Z',
      },
    }));

    expect(res.status).toBe(200);

    const [payload] = firebaseMocks.mockSet.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({
      bodyFat: 0,
      bmi: null,
      leanBodyMass: null,
    }));
  });

  it('uses the JST date key when measuredAt is next day in Asia/Tokyo', async () => {
    const res = await POST(createMockRequest({
      body: {
        uid: 'user1',
        weight: 65.8,
        measuredAt: '2026-07-13T16:00:00Z',
      },
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(expect.objectContaining({
      success: true,
      date: '2026-07-14',
      weight: 65.8,
    }));

    const [payload, options] = firebaseMocks.mockSet.mock.calls[0];
    expect(mockWeightDoc).toHaveBeenCalledWith('2026-07-14');
    expect(payload).toEqual(expect.objectContaining({
      date: '2026-07-14',
      timestamp: '2026-07-13T16:00:00.000Z',
    }));
    expect(options).toEqual({ merge: true });
  });
});
