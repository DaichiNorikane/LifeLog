import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateElenaChatReply: vi.fn(),
  getLineChatContextAdmin: vi.fn(),
  saveLineChatExchangeAdmin: vi.fn(),
  findUserByLineId: vi.fn(),
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/app/actions/line-chat', () => ({
  generateElenaChatReply: mocks.generateElenaChatReply,
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  getLineChatContextAdmin: mocks.getLineChatContextAdmin,
  saveLineChatExchangeAdmin: mocks.saveLineChatExchangeAdmin,
  findUserByLineId: mocks.findUserByLineId,
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

import { handleChatEvent } from '@/lib/line/handlers/chat';

const event = {
  type: 'message',
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
  message: {
    type: 'text',
    text: 'どうしても今甘いものが食べたい。コンビニで買えるものは？',
  },
};

const user = {
  uid: 'uid-1',
  data: { targetCalories: 2000, currentWeight: 65.2 },
};

const context = {
  user: { targetCalories: 2000, currentWeight: 65.2 },
  today: { totalCalories: 400, remainingCalories: 1600, meals: [] },
  stockItems: [{ name: '卵' }],
  messageHistory: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.replyOrPushMessage.mockResolvedValue({ success: true });
  mocks.getLineChatContextAdmin.mockResolvedValue(context);
  mocks.generateElenaChatReply.mockResolvedValue('残り1600kcalあるから、低脂質スイーツにしよ！🍮');
  mocks.saveLineChatExchangeAdmin.mockResolvedValue(undefined);
});

describe('LINE chat handler', () => {
  it('replies with Gemini chat output and saves the conversation history', async () => {
    await handleChatEvent(event, user, event.message.text);

    expect(mocks.getLineChatContextAdmin).toHaveBeenCalledWith('uid-1', user.data);
    expect(mocks.generateElenaChatReply).toHaveBeenCalledWith(expect.objectContaining({
      ...context,
      userText: event.message.text,
    }));
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(event, {
      type: 'text',
      text: '残り1600kcalあるから、低脂質スイーツにしよ！🍮',
    });
    expect(mocks.saveLineChatExchangeAdmin).toHaveBeenCalledWith(
      'uid-1',
      event.message.text,
      '残り1600kcalあるから、低脂質スイーツにしよ！🍮',
    );
  });

  it('does not block the reply when history saving fails', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.saveLineChatExchangeAdmin.mockRejectedValue(new Error('Firestore down'));

    await handleChatEvent(event, user, event.message.text);

    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(event, expect.objectContaining({
      text: '残り1600kcalあるから、低脂質スイーツにしよ！🍮',
    }));
    consoleWarn.mockRestore();
  });

  it('uses the existing account-link guidance for an unlinked LINE user', async () => {
    mocks.findUserByLineId.mockResolvedValue(null);

    const result = await handleChatEvent(event);

    expect(result).toBeNull();
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(event, expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('まずはアカウント連携をお願いします'),
    }));
    expect(mocks.generateElenaChatReply).not.toHaveBeenCalled();
    expect(mocks.saveLineChatExchangeAdmin).not.toHaveBeenCalled();
  });
});
