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

const mockSendPushToUser = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/pushHelper', () => ({
  sendPushToUser: mockSendPushToUser,
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

describe('POST /api/push/send', () => {
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

    const mod = await import('@/app/api/push/send/route.js');
    POST = mod.POST;
  });

  it('returns 400 when missing userId', async () => {
    const req = createMockRequest({
      body: { title: 'Test', body: 'Test body' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing userId');
  });

  it('returns 404 when user not found', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    const req = createMockRequest({
      body: { userId: 'nonexistent', title: 'Test', body: 'Test body' },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('User not found');
  });

  it('returns 400 when no push subscription', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({}),
    });

    const req = createMockRequest({
      body: { userId: 'user1', title: 'Test', body: 'Test body' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('No push subscription');
  });

  it('returns success when push sent', async () => {
    const subscription = { endpoint: 'https://push.example.com', keys: { p256dh: 'key', auth: 'auth' } };
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ pushSubscription: subscription }),
    });

    const req = createMockRequest({
      body: { userId: 'user1', title: 'エレナより', body: 'テスト通知', tag: 'test' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockSendPushToUser).toHaveBeenCalledWith(
      'user1',
      subscription,
      expect.objectContaining({
        title: 'エレナより',
        body: 'テスト通知',
        tag: 'test',
      })
    );
  });

  it('returns 500 when push fails', async () => {
    const subscription = { endpoint: 'https://push.example.com' };
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ pushSubscription: subscription }),
    });
    mockSendPushToUser.mockResolvedValueOnce(false);

    const req = createMockRequest({
      body: { userId: 'user1', title: 'Test', body: 'Test' },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Push failed');
  });

  it('handles unexpected errors', async () => {
    mockGet.mockRejectedValueOnce(new Error('Unexpected DB error'));

    const req = createMockRequest({
      body: { userId: 'user1', title: 'Test', body: 'Test' },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Unexpected DB error');
  });
});
