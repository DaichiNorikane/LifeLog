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

const mockValidateSignature = vi.fn().mockReturnValue(true);
const mockReplyMessage = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/line', () => ({
  validateSignature: mockValidateSignature,
  replyMessage: mockReplyMessage,
}));

const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue();
const mockUpdate = vi.fn().mockResolvedValue();
const mockWhere = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockReturnThis();
const mockDelete = vi.fn().mockResolvedValue();
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

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: vi.fn(() => 'mock-timestamp') },
}));

const mockSuggestNextMeal = vi.fn().mockResolvedValue({
  suggestions: [
    { name: 'テストメニュー', reason: 'テスト理由', calories: 500 },
  ],
  advice: 'テストアドバイス',
});
vi.mock('@/app/actions/meal-advisor', () => ({
  suggestNextMeal: mockSuggestNextMeal,
}));

// --- Helpers ---

function createMockRequest(options = {}) {
  return {
    headers: new Headers(options.headers || {}),
    json: vi.fn().mockResolvedValue(options.body || {}),
    text: vi.fn().mockResolvedValue(options.text || '{}'),
  };
}

function createWebhookBody(events) {
  return JSON.stringify({ events });
}

// --- Tests ---

describe('POST /api/line/webhook', () => {
  let POST;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.LINE_CHANNEL_SECRET = 'test-secret';

    mockWhere.mockReturnThis();
    mockLimit.mockReturnThis();
    mockValidateSignature.mockReturnValue(true);
    mockDoc.mockReturnValue({
      get: mockGet,
      set: mockSet,
      update: mockUpdate,
      collection: vi.fn().mockReturnValue({
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

    const mod = await import('@/app/api/line/webhook/route.js');
    POST = mod.POST;
  });

  it('returns 500 when LINE_CHANNEL_SECRET is missing', async () => {
    delete process.env.LINE_CHANNEL_SECRET;

    const body = createWebhookBody([]);
    const req = createMockRequest({
      headers: { 'x-line-signature': 'sig' },
      text: body,
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Config error');
  });

  it('returns 403 on invalid signature', async () => {
    mockValidateSignature.mockReturnValue(false);

    const body = createWebhookBody([]);
    const req = createMockRequest({
      headers: { 'x-line-signature': 'bad-sig' },
      text: body,
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Invalid signature');
  });

  it('returns success on valid signature with empty events', async () => {
    const body = createWebhookBody([]);
    const req = createMockRequest({
      headers: { 'x-line-signature': 'valid-sig' },
      text: body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('success');
  });

  it('handles text message with meal keyword', async () => {
    // User lookup returns a match
    const userDoc = {
      id: 'app-user-1',
      data: () => ({ targetCalories: 2200 }),
    };
    mockGet.mockResolvedValueOnce({ empty: false, docs: [userDoc] });

    // meals query
    mockGet.mockResolvedValueOnce({
      empty: true,
      docs: [],
    });
    // stock query
    mockGet.mockResolvedValueOnce({
      empty: true,
      docs: [],
    });

    const events = [
      {
        type: 'message',
        message: { type: 'text', text: '朝食' },
        source: { userId: 'line-user-1' },
        replyToken: 'reply-token-1',
      },
    ];
    const body = createWebhookBody(events);
    const req = createMockRequest({
      headers: { 'x-line-signature': 'valid-sig' },
      text: body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSuggestNextMeal).toHaveBeenCalled();
    expect(mockReplyMessage).toHaveBeenCalledWith(
      'reply-token-1',
      expect.objectContaining({ type: 'text' })
    );
  });

  it('replies with link prompt when user not found for meal keyword', async () => {
    // User lookup returns empty
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const events = [
      {
        type: 'message',
        message: { type: 'text', text: '昼食' },
        source: { userId: 'unknown-line-user' },
        replyToken: 'reply-token-2',
      },
    ];
    const body = createWebhookBody(events);
    const req = createMockRequest({
      headers: { 'x-line-signature': 'valid-sig' },
      text: body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockReplyMessage).toHaveBeenCalledWith(
      'reply-token-2',
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('アカウント連携'),
      })
    );
  });

  it('handles follow event', async () => {
    const events = [
      {
        type: 'follow',
        replyToken: 'follow-reply-token',
        source: { userId: 'new-line-user' },
      },
    ];
    const body = createWebhookBody(events);
    const req = createMockRequest({
      headers: { 'x-line-signature': 'valid-sig' },
      text: body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockReplyMessage).toHaveBeenCalledWith(
      'follow-reply-token',
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('友だち追加ありがとうございます'),
      })
    );
  });

  it('handles 6-digit link code successfully', async () => {
    // linkCodes query returns a match
    const linkDoc = {
      id: 'link-doc-1',
      data: () => ({ code: '123456', userId: 'app-user-1' }),
      ref: { delete: mockDelete },
    };
    mockGet.mockResolvedValueOnce({ empty: false, docs: [linkDoc] });
    mockUpdate.mockResolvedValue();

    const events = [
      {
        type: 'message',
        message: { type: 'text', text: '123456' },
        source: { userId: 'line-user-1' },
        replyToken: 'reply-token-link',
      },
    ];
    const body = createWebhookBody(events);
    const req = createMockRequest({
      headers: { 'x-line-signature': 'valid-sig' },
      text: body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockReplyMessage).toHaveBeenCalledWith(
      'reply-token-link',
      expect.objectContaining({
        text: expect.stringContaining('連携しました'),
      })
    );
  });

  it('handles suggestion error gracefully', async () => {
    // User lookup returns a match
    const userDoc = {
      id: 'app-user-1',
      data: () => ({ targetCalories: 2200 }),
    };
    mockGet.mockResolvedValueOnce({ empty: false, docs: [userDoc] });

    // meals/stock queries throw
    mockGet.mockRejectedValueOnce(new Error('DB error'));

    const events = [
      {
        type: 'message',
        message: { type: 'text', text: '夕食' },
        source: { userId: 'line-user-1' },
        replyToken: 'reply-token-err',
      },
    ];
    const body = createWebhookBody(events);
    const req = createMockRequest({
      headers: { 'x-line-signature': 'valid-sig' },
      text: body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockReplyMessage).toHaveBeenCalledWith(
      'reply-token-err',
      expect.objectContaining({
        text: expect.stringContaining('ごめんなさい'),
      })
    );
  });
});
