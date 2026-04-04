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

// Mock firebase-admin/firestore for DELETE handler's dynamic import
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    delete: vi.fn(() => 'FIELD_DELETE_SENTINEL'),
  },
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

describe('POST /api/push/subscribe', () => {
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

    const mod = await import('@/app/api/push/subscribe/route.js');
    POST = mod.POST;
  });

  it('returns 400 when missing userId', async () => {
    const req = createMockRequest({
      body: { subscription: { endpoint: 'https://push.example.com' } },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing userId or subscription');
  });

  it('returns 400 when missing subscription', async () => {
    const req = createMockRequest({
      body: { userId: 'user1' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing userId or subscription');
  });

  it('saves subscription successfully', async () => {
    const subscription = { endpoint: 'https://push.example.com', keys: { p256dh: 'key', auth: 'auth' } };
    const req = createMockRequest({
      body: { userId: 'user1', subscription },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ pushSubscription: subscription }),
      { merge: true }
    );
  });

  it('handles Firestore error', async () => {
    mockSet.mockRejectedValueOnce(new Error('Firestore write failed'));

    const req = createMockRequest({
      body: { userId: 'user1', subscription: { endpoint: 'https://push.example.com' } },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Firestore write failed');
  });
});

describe('DELETE /api/push/subscribe', () => {
  let DELETE;

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

    const mod = await import('@/app/api/push/subscribe/route.js');
    DELETE = mod.DELETE;
  });

  it('returns 400 when missing userId', async () => {
    const req = createMockRequest({
      body: {},
    });

    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing userId');
  });

  it('deletes subscription successfully', async () => {
    const req = createMockRequest({
      body: { userId: 'user1' },
    });

    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        pushSubscription: 'FIELD_DELETE_SENTINEL',
        pushSubscribedAt: 'FIELD_DELETE_SENTINEL',
      })
    );
  });

  it('handles Firestore error on delete', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Firestore update failed'));

    const req = createMockRequest({
      body: { userId: 'user1' },
    });

    const res = await DELETE(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Firestore update failed');
  });
});
