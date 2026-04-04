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
const mockDoc = vi.fn().mockReturnValue({
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
});
const mockCollection = vi.fn().mockReturnValue({
  doc: mockDoc,
  get: mockGet,
});

vi.mock('@/lib/firebase/admin', () => ({ db: { collection: mockCollection } }));

const mockPushMessage = vi.fn().mockResolvedValue({});
vi.mock('@/lib/line', () => ({
  getLineClient: vi.fn(() => ({ pushMessage: mockPushMessage })),
}));

// --- Helpers ---

function createMockRequest(options = {}) {
  return {
    headers: new Headers(options.headers || {}),
    json: vi.fn().mockResolvedValue(options.body || {}),
    text: vi.fn().mockResolvedValue(options.text || '{}'),
  };
}

// --- Tests ---

describe('POST /api/line/push', () => {
  let POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockDoc.mockReturnValue({
      get: mockGet,
      set: mockSet,
      update: mockUpdate,
    });
    mockCollection.mockReturnValue({
      doc: mockDoc,
      get: mockGet,
    });

    const mod = await import('@/app/api/line/push/route.js');
    POST = mod.POST;
  });

  it('returns 400 when missing userId', async () => {
    const req = createMockRequest({
      body: { evaluation: { score: 80, title: 'Good' } },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing userId or evaluation data');
  });

  it('returns 400 when missing evaluation', async () => {
    const req = createMockRequest({
      body: { userId: 'user1' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing userId or evaluation data');
  });

  it('returns 404 when user not found', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    const req = createMockRequest({
      body: { userId: 'nonexistent', evaluation: { score: 80, title: 'OK' } },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('User not found');
  });

  it('returns 400 when LINE not linked', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ pushSubscription: {} }),
    });

    const req = createMockRequest({
      body: { userId: 'user1', evaluation: { score: 80, title: 'OK' } },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('LINE not linked');
  });

  it('returns success when message sent', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ lineUserId: 'line-123' }),
    });

    const req = createMockRequest({
      body: {
        userId: 'user1',
        evaluation: { score: 85, title: 'Great', reason: 'Well done', advice: 'Keep going' },
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockPushMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'line-123',
        messages: expect.arrayContaining([
          expect.objectContaining({ type: 'text' }),
        ]),
      })
    );
  });

  it('handles LINE API error', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ lineUserId: 'line-123' }),
    });
    mockPushMessage.mockRejectedValueOnce(new Error('LINE API error'));

    const req = createMockRequest({
      body: {
        userId: 'user1',
        evaluation: { score: 50, title: 'Bad', reason: 'Needs work' },
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('LINE API error');
  });
});
