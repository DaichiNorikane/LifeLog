import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({
      status: init?.status || 200,
      json: async () => data,
      _data: data,
    })),
  },
}));

const mocks = vi.hoisted(() => ({
  validateSignature: vi.fn().mockReturnValue(true),
  handleLineEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/line', () => ({
  validateSignature: mocks.validateSignature,
}));

vi.mock('@/lib/line/router', () => ({
  handleLineEvents: mocks.handleLineEvents,
}));

function createMockRequest(options = {}) {
  return {
    headers: new Headers(options.headers || {}),
    text: vi.fn().mockResolvedValue(options.text || '{}'),
  };
}

function createWebhookBody(events) {
  return JSON.stringify({ events });
}

describe('POST /api/line/webhook', () => {
  let POST;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.LINE_CHANNEL_SECRET = 'test-secret';
    mocks.validateSignature.mockReturnValue(true);
    mocks.handleLineEvents.mockResolvedValue([]);

    const mod = await import('@/app/api/line/webhook/route.js');
    POST = mod.POST;
  });

  it('returns 500 when LINE_CHANNEL_SECRET is missing', async () => {
    delete process.env.LINE_CHANNEL_SECRET;

    const req = createMockRequest({
      headers: { 'x-line-signature': 'sig' },
      text: createWebhookBody([]),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Config error');
    expect(mocks.handleLineEvents).not.toHaveBeenCalled();
  });

  it('returns 403 on invalid signature', async () => {
    mocks.validateSignature.mockReturnValue(false);

    const body = createWebhookBody([]);
    const req = createMockRequest({
      headers: { 'x-line-signature': 'bad-sig' },
      text: body,
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Invalid signature');
    expect(mocks.validateSignature).toHaveBeenCalledWith(body, 'test-secret', 'bad-sig');
    expect(mocks.handleLineEvents).not.toHaveBeenCalled();
  });

  it('passes events to the LINE router on valid signature', async () => {
    const events = [
      {
        type: 'follow',
        replyToken: 'follow-reply-token',
        source: { userId: 'line-user-1' },
      },
    ];
    const body = createWebhookBody(events);
    const req = createMockRequest({
      headers: { 'x-line-signature': 'valid-sig' },
      text: body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('success');
    expect(mocks.handleLineEvents).toHaveBeenCalledWith(events);
  });
});
