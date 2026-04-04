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
    doc: vi.fn().mockReturnValue({
      get: mockGet,
      set: mockSet,
    }),
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

const mockPushMessage = vi.fn().mockResolvedValue({});
vi.mock('@/lib/line', () => ({
  getLineClient: vi.fn(() => ({ pushMessage: mockPushMessage })),
}));

const mockEvaluateDailyLog = vi.fn().mockResolvedValue({
  score: 75,
  title: 'Good',
  advice: 'test advice',
  reason: 'test reason',
  characterStatus: '[STATUS: CHEER]',
});
vi.mock('@/app/actions/daily-evaluation', () => ({
  evaluateDailyLog: mockEvaluateDailyLog,
}));

const mockSendPushToUser = vi.fn().mockResolvedValue(true);
const mockGetJSTToday = vi.fn(() => ({
  jstNow: new Date('2024-01-15T12:00:00+09:00'),
  todayStr: '2024-01-15',
}));
vi.mock('@/lib/pushHelper', () => ({
  sendPushToUser: mockSendPushToUser,
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

function createMealDoc(id, data) {
  return { id, data: () => data };
}

// --- Tests ---

describe('GET /api/cron/daily-report', () => {
  let GET;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };

    // Re-setup mock chain after clearAllMocks
    mockWhere.mockReturnThis();
    mockLimit.mockReturnThis();
    mockDoc.mockReturnValue({
      get: mockGet,
      set: mockSet,
      update: mockUpdate,
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: mockGet,
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

    const mod = await import('@/app/api/cron/daily-report/route.js');
    GET = mod.GET;
  });

  it('returns 401 when auth header is wrong in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = 'real-secret';

    const req = createMockRequest({
      headers: { authorization: 'Bearer wrong-secret' },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns "No users" when snapshot is empty', async () => {
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const req = createMockRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe('No users');
  });

  it('skips users without lineUserId and pushSubscription', async () => {
    const userDoc = createUserDoc('user1', {});
    mockGet.mockResolvedValueOnce({ empty: false, docs: [userDoc] });

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.processed).toBe(0);
    expect(mockPushMessage).not.toHaveBeenCalled();
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it('sends LINE message when lineUserId exists and meals recorded', async () => {
    const userDoc = createUserDoc('user1', {
      lineUserId: 'line-123',
      targetCalories: 2000,
    });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [userDoc] });

    // meals query
    const mealDoc = createMealDoc('meal1', {
      calories: 500,
      name: 'サラダ',
      timestamp: '2024-01-15T12:00:00+09:00',
    });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [mealDoc] });

    // daily_evaluations set - already mocked
    mockSet.mockResolvedValue();

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.processed).toBe(1);
    expect(mockPushMessage).toHaveBeenCalled();
  });

  it('sends push notification when pushSubscription exists and meals recorded', async () => {
    const userDoc = createUserDoc('user1', {
      pushSubscription: { endpoint: 'https://push.example.com' },
      targetCalories: 2000,
    });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [userDoc] });

    // meals query
    const mealDoc = createMealDoc('meal1', {
      calories: 600,
      name: 'チキン',
      timestamp: '2024-01-15T12:00:00+09:00',
    });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [mealDoc] });

    // daily_evaluations set
    mockSet.mockResolvedValue();

    // weight doc check
    mockGet.mockResolvedValueOnce({ exists: false });

    // streak checks - first day has meals, second day empty (streak = 1)
    mockGet.mockResolvedValueOnce({ empty: false, docs: [mealDoc] });
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockSendPushToUser).toHaveBeenCalled();
  });

  it('handles evaluation error gracefully', async () => {
    mockEvaluateDailyLog.mockResolvedValueOnce({ error: 'AI failed' });

    const userDoc = createUserDoc('user1', {
      lineUserId: 'line-123',
      targetCalories: 2000,
    });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [userDoc] });

    // meals query
    const mealDoc = createMealDoc('meal1', {
      calories: 500,
      timestamp: '2024-01-15T12:00:00+09:00',
    });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [mealDoc] });

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.processed).toBe(0);
    expect(mockPushMessage).not.toHaveBeenCalled();
  });

  it('returns success with results array', async () => {
    const user1 = createUserDoc('user1', { lineUserId: 'line-1', targetCalories: 2000 });
    const user2 = createUserDoc('user2', { lineUserId: 'line-2', targetCalories: 1800 });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [user1, user2] });

    // meals for user1
    const mealDoc = createMealDoc('m1', { calories: 400, timestamp: '2024-01-15T12:00:00+09:00' });
    mockGet.mockResolvedValueOnce({ empty: false, docs: [mealDoc] });
    mockSet.mockResolvedValue();

    // meals for user2
    mockGet.mockResolvedValueOnce({ empty: false, docs: [mealDoc] });
    mockSet.mockResolvedValue();

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.processed).toBe(2);
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValueOnce(new Error('Firestore down'));

    const req = createMockRequest();
    const res = await GET(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Firestore down');
  });
});
