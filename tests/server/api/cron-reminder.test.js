import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({
      status: init?.status || 200,
      json: async () => data,
      _data: data,
    })),
  },
}));

const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue();
const mockUpdate = vi.fn().mockResolvedValue();
const mockWhere = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockReturnThis();
const mockDoc = vi.fn().mockReturnValue({
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
  collection: vi.fn().mockReturnValue({
    where: mockWhere,
    limit: mockLimit,
    get: mockGet,
  }),
});
const mockCollection = vi.fn().mockReturnValue({
  doc: mockDoc,
  get: mockGet,
  where: mockWhere,
  limit: mockLimit,
});

vi.mock('@/lib/firebase/admin', () => ({ db: { collection: mockCollection } }));

const mockSendPushWithLimit = vi.fn().mockResolvedValue(true);
const mockGetTodayMeals = vi.fn().mockResolvedValue([]);
const mockGetJSTToday = vi.fn(() => ({
  jstNow: new Date('2024-01-15T12:00:00+09:00'),
  todayStr: '2024-01-15',
}));
vi.mock('@/lib/pushHelper', () => ({
  sendPushWithLimit: mockSendPushWithLimit,
  getTodayMeals: mockGetTodayMeals,
  getJSTToday: mockGetJSTToday,
}));

// --- Helpers ---

function createMockRequest(options = {}) {
  return {
    headers: new Headers(options.headers || {}),
    json: vi.fn().mockResolvedValue(options.body || {}),
    text: vi.fn().mockResolvedValue(options.text || '{}'),
  };
}

function createUserDoc(id, data) {
  return { id, data: () => data };
}

// --- Tests ---

describe('GET /api/cron/reminder', () => {
  let GET;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };

    mockWhere.mockReturnThis();
    mockLimit.mockReturnThis();
    mockDoc.mockReturnValue({
      get: mockGet,
      set: mockSet,
      update: mockUpdate,
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: false }),
          set: mockSet,
        }),
        where: mockWhere,
        limit: mockLimit,
        get: mockGet,
      }),
    });
    mockCollection.mockReturnValue({
      doc: mockDoc,
      get: mockGet,
      where: mockWhere,
      limit: mockLimit,
    });

    const mod = await import('@/app/api/cron/reminder/route.js');
    GET = mod.GET;
  });

  it('returns 401 on bad auth in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = 'real-secret';

    const req = createMockRequest({
      headers: { authorization: 'Bearer wrong' },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns "No users" when empty', async () => {
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const req = createMockRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe('No users');
  });

  it('skips users without pushSubscription', async () => {
    const userDoc = createUserDoc('user1', { lineUserId: 'line-123' });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [userDoc] });

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sent).toBe(0);
    expect(mockSendPushWithLimit).not.toHaveBeenCalled();
  });

  it('sends reminder when no morning meals recorded', async () => {
    const userDoc = createUserDoc('user1', {
      pushSubscription: { endpoint: 'https://push.example.com' },
    });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [userDoc] });

    // No meals today
    mockGetTodayMeals.mockResolvedValueOnce([]);

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sent).toBe(1);
    expect(mockSendPushWithLimit).toHaveBeenCalledWith(
      'user1',
      { endpoint: 'https://push.example.com' },
      '2024-01-15',
      'reminder',
      expect.objectContaining({
        tag: 'meal-reminder-2024-01-15',
      })
    );
  });

  it('does not send reminder when morning meal exists', async () => {
    const userDoc = createUserDoc('user1', {
      pushSubscription: { endpoint: 'https://push.example.com' },
    });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [userDoc] });

    // Morning meal recorded (8:00 JST = 23:00 UTC previous day... let's use 7:00 JST = UTC-2)
    mockGetTodayMeals.mockResolvedValueOnce([
      { id: 'm1', calories: 400, timestamp: '2024-01-14T23:00:00.000Z' }, // 8:00 JST
    ]);

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sent).toBe(0);
    expect(mockSendPushWithLimit).not.toHaveBeenCalled();
  });

  it('returns success count for multiple users', async () => {
    const user1 = createUserDoc('user1', {
      pushSubscription: { endpoint: 'https://push1.example.com' },
    });
    const user2 = createUserDoc('user2', {
      pushSubscription: { endpoint: 'https://push2.example.com' },
    });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [user1, user2] });

    // Both have no meals
    mockGetTodayMeals.mockResolvedValue([]);

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sent).toBe(2);
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValueOnce(new Error('DB error'));

    const req = createMockRequest();
    const res = await GET(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('DB error');
  });
});
