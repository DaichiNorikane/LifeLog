import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const serverTimestampSentinel = { __fieldValue: 'serverTimestamp' };
  return {
    serverTimestampSentinel,
    serverTimestamp: vi.fn(() => serverTimestampSentinel),
    replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
    linkCodeGet: vi.fn(),
    linkCodeWhere: vi.fn(),
    linkCodeLimit: vi.fn(),
    linkCodeDelete: vi.fn(),
    userDoc: vi.fn(),
    userUpdate: vi.fn(),
    dbCollection: vi.fn(),
    findUserByLineId: vi.fn(),
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: mocks.dbCollection,
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: mocks.serverTimestamp,
  },
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: mocks.replyOrPushMessage,
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  findUserByLineId: mocks.findUserByLineId,
}));

import { handleFollowEvent, handleLinkCodeEvent, linkUserAccount } from '@/lib/line/handlers/link';
import { LINK_REQUIRED_MESSAGE, resolveUserOrReply } from '@/lib/line/resolveUser';

const event = {
  type: 'message',
  source: { userId: 'line-user-1' },
  replyToken: 'reply-token',
  message: { type: 'text', text: '123456' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serverTimestamp.mockReturnValue(mocks.serverTimestampSentinel);
  mocks.replyOrPushMessage.mockResolvedValue({ success: true });
  mocks.linkCodeLimit.mockReturnValue({ get: mocks.linkCodeGet });
  mocks.linkCodeWhere.mockReturnValue({ limit: mocks.linkCodeLimit });
  mocks.userUpdate.mockResolvedValue(undefined);
  mocks.userDoc.mockReturnValue({ update: mocks.userUpdate });
  mocks.dbCollection.mockImplementation((name) => {
    if (name === 'linkCodes') return { where: mocks.linkCodeWhere };
    if (name === 'users') return { doc: mocks.userDoc };
    return {};
  });
});

describe('LINE link handler', () => {
  it('links a 6-digit code, updates the user line id, and deletes the link code', async () => {
    mocks.linkCodeGet.mockResolvedValue({
      empty: false,
      docs: [{
        data: () => ({ userId: 'uid-1' }),
        ref: { delete: mocks.linkCodeDelete },
      }],
    });
    mocks.linkCodeDelete.mockResolvedValue(undefined);

    const result = await linkUserAccount('123456', 'line-user-1');

    expect(result).toEqual({ success: true, uid: 'uid-1' });
    expect(mocks.linkCodeWhere).toHaveBeenCalledWith('code', '==', '123456');
    expect(mocks.userDoc).toHaveBeenCalledWith('uid-1');
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      lineUserId: 'line-user-1',
      lineLinkedAt: mocks.serverTimestampSentinel,
    });
    expect(mocks.linkCodeDelete).toHaveBeenCalledTimes(1);
  });

  it('replies with the invalid-code guidance when a code does not match', async () => {
    mocks.linkCodeGet.mockResolvedValue({ empty: true, docs: [] });

    await handleLinkCodeEvent(event, '999999');

    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(event, expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('コードが見つからないか、有効期限切れです'),
    }));
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.linkCodeDelete).not.toHaveBeenCalled();
  });

  it('replies with account-link guidance for an unlinked LINE user', async () => {
    mocks.findUserByLineId.mockResolvedValue(null);

    const result = await resolveUserOrReply(event);

    expect(result).toBeNull();
    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(event, LINK_REQUIRED_MESSAGE);
    expect(LINK_REQUIRED_MESSAGE.text).toContain('6桁の数字');
  });

  it('replies with the follow greeting and link instructions', async () => {
    await handleFollowEvent({ ...event, type: 'follow' });

    expect(mocks.replyOrPushMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'follow' }), expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('友だち追加ありがとうございます'),
    }));
    expect(mocks.replyOrPushMessage.mock.calls[0][1].text).toContain('6桁の数字');
  });
});
