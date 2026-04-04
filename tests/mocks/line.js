/**
 * Mock for @line/bot-sdk
 */

export const mockPushMessage = vi.fn().mockResolvedValue({});
export const mockReplyMessage = vi.fn().mockResolvedValue({});
export const mockValidateSignature = vi.fn().mockReturnValue(true);

export function setupLineMock(vi) {
  vi.mock('@line/bot-sdk', () => ({
    messagingApi: {
      MessagingApiClient: vi.fn().mockImplementation(() => ({
        pushMessage: mockPushMessage,
        replyMessage: mockReplyMessage,
      })),
    },
    MessagingApiClient: vi.fn().mockImplementation(() => ({
      pushMessage: mockPushMessage,
      replyMessage: mockReplyMessage,
    })),
    validateSignature: mockValidateSignature,
  }));

  return { mockPushMessage, mockReplyMessage, mockValidateSignature };
}
