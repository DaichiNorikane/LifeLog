import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock web-push
const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();
vi.mock('web-push', () => ({
  default: {
    sendNotification: mockSendNotification,
    setVapidDetails: mockSetVapidDetails,
  },
}));

// Mock firebase-admin
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDocRef = vi.fn().mockReturnValue({ update: mockUpdate });
const mockCollectionRef = vi.fn().mockReturnValue({ doc: mockDocRef });
vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: mockCollectionRef,
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    delete: vi.fn().mockReturnValue('__DELETE__'),
  },
}));

describe('pushHelper', () => {
  let sendPushToUser, getJSTToday;
  const savedEnv = {};

  beforeEach(async () => {
    vi.resetModules();
    mockSendNotification.mockReset();
    mockSetVapidDetails.mockReset();
    mockUpdate.mockReset().mockResolvedValue(undefined);

    // Re-mock after resetModules
    vi.doMock('web-push', () => ({
      default: {
        sendNotification: mockSendNotification,
        setVapidDetails: mockSetVapidDetails,
      },
    }));
    vi.doMock('@/lib/firebase/admin', () => ({
      db: {
        collection: mockCollectionRef,
      },
    }));
    vi.doMock('firebase-admin/firestore', () => ({
      FieldValue: {
        delete: vi.fn().mockReturnValue('__DELETE__'),
      },
    }));

    // Save and clear env
    savedEnv.VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    savedEnv.VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const mod = await import('@/lib/pushHelper');
    sendPushToUser = mod.sendPushToUser;
    getJSTToday = mod.getJSTToday;
  });

  afterEach(() => {
    // Restore env
    if (savedEnv.VAPID_PUBLIC !== undefined) {
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = savedEnv.VAPID_PUBLIC;
    }
    if (savedEnv.VAPID_PRIVATE !== undefined) {
      process.env.VAPID_PRIVATE_KEY = savedEnv.VAPID_PRIVATE;
    }
  });

  // ---- getJSTToday ----
  describe('getJSTToday', () => {
    it('returns object with jstNow as Date and todayStr in YYYY-MM-DD format', () => {
      const result = getJSTToday();
      expect(result.jstNow).toBeInstanceOf(Date);
      expect(typeof result.todayStr).toBe('string');
      expect(result.todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ---- sendPushToUser ----
  describe('sendPushToUser', () => {
    const subscription = { endpoint: 'https://push.example.com', keys: { p256dh: 'key', auth: 'auth' } };

    it('returns false when no subscription', async () => {
      const result = await sendPushToUser('user1', null, { title: 'Test' });
      expect(result).toBe(false);
    });

    it('returns false when VAPID not configured (no env vars)', async () => {
      const result = await sendPushToUser('user1', subscription, { title: 'Test' });
      expect(result).toBe(false);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it('returns true on success with env vars set', async () => {
      // Need to re-import with env vars set
      vi.resetModules();
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public-key';
      process.env.VAPID_PRIVATE_KEY = 'test-private-key';

      vi.doMock('web-push', () => ({
        default: {
          sendNotification: mockSendNotification,
          setVapidDetails: mockSetVapidDetails,
        },
      }));
      vi.doMock('@/lib/firebase/admin', () => ({
        db: { collection: mockCollectionRef },
      }));

      mockSendNotification.mockResolvedValue({});
      const mod = await import('@/lib/pushHelper');

      const result = await mod.sendPushToUser('user1', subscription, {
        title: 'Hello',
        body: 'World',
        tag: 'test',
        url: '/dashboard',
      });
      expect(result).toBe(true);
      expect(mockSendNotification).toHaveBeenCalledOnce();

      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.title).toBe('Hello');
      expect(payload.body).toBe('World');
    });

    it('returns false and cleans up subscription on 410 error', async () => {
      vi.resetModules();
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public-key';
      process.env.VAPID_PRIVATE_KEY = 'test-private-key';

      vi.doMock('web-push', () => ({
        default: {
          sendNotification: mockSendNotification,
          setVapidDetails: mockSetVapidDetails,
        },
      }));
      vi.doMock('@/lib/firebase/admin', () => ({
        db: { collection: mockCollectionRef },
      }));
      vi.doMock('firebase-admin/firestore', () => ({
        FieldValue: {
          delete: vi.fn().mockReturnValue('__DELETE__'),
        },
      }));

      const error = new Error('Gone');
      error.statusCode = 410;
      mockSendNotification.mockRejectedValue(error);
      mockUpdate.mockResolvedValue(undefined);

      const mod = await import('@/lib/pushHelper');
      const result = await mod.sendPushToUser('user1', subscription, { title: 'Test' });

      expect(result).toBe(false);
      expect(mockCollectionRef).toHaveBeenCalledWith('users');
      expect(mockDocRef).toHaveBeenCalledWith('user1');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('returns false on other errors without cleanup', async () => {
      vi.resetModules();
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public-key';
      process.env.VAPID_PRIVATE_KEY = 'test-private-key';

      vi.doMock('web-push', () => ({
        default: {
          sendNotification: mockSendNotification,
          setVapidDetails: mockSetVapidDetails,
        },
      }));
      vi.doMock('@/lib/firebase/admin', () => ({
        db: { collection: mockCollectionRef },
      }));

      const error = new Error('Network error');
      error.statusCode = 500;
      mockSendNotification.mockRejectedValue(error);
      mockUpdate.mockClear();

      const mod = await import('@/lib/pushHelper');
      const result = await mod.sendPushToUser('user1', subscription, { title: 'Test' });

      expect(result).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('truncates body to 200 characters', async () => {
      vi.resetModules();
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public-key';
      process.env.VAPID_PRIVATE_KEY = 'test-private-key';

      vi.doMock('web-push', () => ({
        default: {
          sendNotification: mockSendNotification,
          setVapidDetails: mockSetVapidDetails,
        },
      }));
      vi.doMock('@/lib/firebase/admin', () => ({
        db: { collection: mockCollectionRef },
      }));

      mockSendNotification.mockResolvedValue({});
      const mod = await import('@/lib/pushHelper');

      const longBody = 'a'.repeat(300);
      await mod.sendPushToUser('user1', subscription, { title: 'Test', body: longBody });

      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.body).toHaveLength(200);
    });
  });
});
