/**
 * Mock for @line/bot-sdk
 */

export const mockPushMessage = vi.fn().mockResolvedValue({});
export const mockReplyMessage = vi.fn().mockResolvedValue({});
export const mockShowLoadingAnimation = vi.fn().mockResolvedValue({});
export const mockGetMessageContent = vi.fn().mockResolvedValue(Buffer.from('test-image'));
export const mockValidateSignature = vi.fn().mockReturnValue(true);

export function setupLineMock(vi) {
  vi.mock('@line/bot-sdk', () => ({
    messagingApi: {
      MessagingApiClient: vi.fn().mockImplementation(() => ({
        pushMessage: mockPushMessage,
        replyMessage: mockReplyMessage,
        showLoadingAnimation: mockShowLoadingAnimation,
      })),
      MessagingApiBlobClient: vi.fn().mockImplementation(() => ({
        getMessageContent: mockGetMessageContent,
      })),
    },
    MessagingApiClient: vi.fn().mockImplementation(() => ({
      pushMessage: mockPushMessage,
      replyMessage: mockReplyMessage,
      showLoadingAnimation: mockShowLoadingAnimation,
    })),
    validateSignature: mockValidateSignature,
  }));

  return { mockPushMessage, mockReplyMessage, mockShowLoadingAnimation, mockGetMessageContent, mockValidateSignature };
}
