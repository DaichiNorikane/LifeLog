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

const mockMeals = [
  { id: '1', calories: 500, macros: { protein: 20, fat: 15, carbs: 60 }, timestamp: '2026-04-16T08:00:00Z' },
  { id: '2', calories: 700, macros: { protein: 30, fat: 25, carbs: 70 }, timestamp: '2026-04-16T12:00:00Z' },
];

const mockUserData = {
  targetCalories: 2000,
  currentWeight: 75,
  targetWeight: 70,
};

const mockUserDoc = {
  exists: true,
  data: () => mockUserData,
};

const mockMealsSnapshot = {
  docs: mockMeals.map(m => ({
    id: m.id,
    data: () => ({ calories: m.calories, macros: m.macros, timestamp: m.timestamp }),
  })),
};

const mockGet = vi.fn();
const mockWhere = vi.fn().mockReturnThis();
const mockWeightCollection = {
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
};
const mockDoc = vi.fn().mockReturnValue({ get: mockGet, collection: vi.fn().mockReturnValue(mockWeightCollection) });
const mockCollection = vi.fn().mockReturnValue({
  doc: mockDoc,
  where: mockWhere,
  get: vi.fn().mockResolvedValue(mockMealsSnapshot),
});

vi.mock('@/lib/firebase/admin', () => ({
  db: { collection: mockCollection },
}));

vi.mock('@/lib/pushHelper', () => ({
  getJSTToday: () => ({ todayStr: '2026-04-16', jstNow: new Date('2026-04-16T12:00:00+09:00') }),
  getTodayMeals: vi.fn().mockResolvedValue(mockMeals),
}));

// --- Helpers ---

function createMockRequest({ token, uid } = {}) {
  const headers = new Headers();
  if (token) headers.set('x-widget-token', token);
  const url = new URL(`http://localhost/api/widget/calories${uid ? `?uid=${uid}` : ''}`);
  return {
    headers,
    nextUrl: url,
  };
}

// --- Tests ---

describe('GET /api/widget/calories', () => {
  let GET;

  beforeEach(async () => {
    vi.resetModules();
    process.env.WIDGET_TOKEN = 'test-token-123';

    mockGet.mockResolvedValue(mockUserDoc);
    mockCollection.mockReturnValue({
      doc: mockDoc,
      where: mockWhere,
      get: vi.fn().mockResolvedValue(mockMealsSnapshot),
    });

    const mod = await import('@/app/api/widget/calories/route');
    GET = mod.GET;
  });

  it('returns 401 without token', async () => {
    const req = createMockRequest({ uid: 'user1' });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(res._data.error).toBe('Unauthorized');
  });

  it('returns 401 with wrong token', async () => {
    const req = createMockRequest({ token: 'wrong', uid: 'user1' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 without uid', async () => {
    const req = createMockRequest({ token: 'test-token-123' });
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(res._data.error).toBe('Missing uid');
  });

  it('returns calorie data on success', async () => {
    const req = createMockRequest({ token: 'test-token-123', uid: 'user1' });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = res._data;
    expect(data.calories).toBe(1200);
    expect(data.target).toBe(2000);
    expect(data.remaining).toBe(800);
    expect(data.ratio).toBe(60);
    expect(data.protein).toBe(50);
    expect(data.fat).toBe(40);
    expect(data.carbs).toBe(130);
    expect(data.mealCount).toBe(2);
    expect(data.elenaStatus).toBe('normal');
    expect(data.date).toBe('2026-04-16');
  });
});
