/**
 * Tests for src/lib/line.js
 */

const mockPushMessage = vi.fn().mockResolvedValue({});
const mockReplyMessage = vi.fn().mockResolvedValue({});

vi.mock('@line/bot-sdk', () => ({
  messagingApi: {
    MessagingApiClient: class {
      constructor() {
        this.pushMessage = mockPushMessage;
        this.replyMessage = mockReplyMessage;
      }
    },
  },
  validateSignature: vi.fn().mockReturnValue(true),
}));

import { getLineClient, pushMessage, replyMessage, validateSignature } from '@/lib/line';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset env var
  delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
});

describe('getLineClient', () => {
  it('returns null when no env var', () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const client = getLineClient();
    expect(client).toBeNull();
  });

  it('returns client when env var set', () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    const client = getLineClient();
    expect(client).not.toBeNull();
    expect(client).toHaveProperty('pushMessage');
  });
});

describe('pushMessage', () => {
  it('success path with array messages', async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    const messages = [{ type: 'text', text: 'Hello' }];

    const result = await pushMessage('user1', messages);
    expect(result).toEqual({ success: true });
    expect(mockPushMessage).toHaveBeenCalledWith({
      to: 'user1',
      messages: [{ type: 'text', text: 'Hello' }],
    });
  });

  it('wraps single message in array', async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    const message = { type: 'text', text: 'Single' };

    await pushMessage('user1', message);
    expect(mockPushMessage).toHaveBeenCalledWith({
      to: 'user1',
      messages: [{ type: 'text', text: 'Single' }],
    });
  });

  it('returns error when client not initialized', async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const result = await pushMessage('user1', [{ type: 'text', text: 'Hi' }]);
    expect(result).toEqual({ error: 'Client not initialized' });
  });

  it('returns error on SDK failure', async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    mockPushMessage.mockRejectedValueOnce(new Error('SDK push error'));

    const result = await pushMessage('user1', [{ type: 'text', text: 'Hi' }]);
    expect(result).toEqual({ error: 'SDK push error' });
  });
});

describe('replyMessage', () => {
  it('success path', async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    const messages = [{ type: 'text', text: 'Reply' }];

    const result = await replyMessage('token123', messages);
    expect(result).toEqual({ success: true });
    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: 'token123',
      messages: [{ type: 'text', text: 'Reply' }],
    });
  });

  it('wraps single message in array', async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    await replyMessage('token123', { type: 'text', text: 'Single' });
    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: 'token123',
      messages: [{ type: 'text', text: 'Single' }],
    });
  });

  it('returns error when client not initialized', async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const result = await replyMessage('token123', [{ type: 'text', text: 'Hi' }]);
    expect(result).toEqual({ error: 'Client not initialized' });
  });

  it('returns error on SDK failure', async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    mockReplyMessage.mockRejectedValueOnce(new Error('SDK reply error'));

    const result = await replyMessage('token123', [{ type: 'text', text: 'Hi' }]);
    expect(result).toEqual({ error: 'SDK reply error' });
  });
});

describe('validateSignature', () => {
  it('is re-exported from @line/bot-sdk', () => {
    expect(validateSignature).toBeDefined();
    expect(typeof validateSignature).toBe('function');
    // Verify it's our mock
    expect(validateSignature('body', 'secret', 'signature')).toBe(true);
  });
});
