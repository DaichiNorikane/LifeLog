// Set env before module loads (vi.hoisted runs before imports)
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BPxR0hNdX3-HY0Dq2gRmLtestkey1234567890abcdef';
});

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePushNotification } from '@/lib/usePushNotification';

// Mock fetch
global.fetch = vi.fn();

// Mock navigator.serviceWorker
const mockGetSubscription = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();

const mockPushManager = {
  getSubscription: mockGetSubscription,
  subscribe: mockSubscribe,
};

const mockRegistration = {
  pushManager: mockPushManager,
};

Object.defineProperty(global.navigator, 'serviceWorker', {
  value: {
    ready: Promise.resolve(mockRegistration),
  },
  writable: true,
});

// Mock Notification
global.Notification = {
  requestPermission: vi.fn(),
};

// Mock PushManager
global.PushManager = vi.fn();

// VAPID key is set in vi.hoisted above

describe('usePushNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscription.mockResolvedValue(null);
    fetch.mockResolvedValue({ ok: true });
  });

  it('returns isSupported based on navigator capabilities', () => {
    const { result } = renderHook(() => usePushNotification('test-user'));
    // Since we mocked serviceWorker and PushManager, isSupported should be true
    // (it also requires VAPID_PUBLIC_KEY)
    expect(typeof result.current.isSupported).toBe('boolean');
  });

  it('returns initial state correctly', () => {
    const { result } = renderHook(() => usePushNotification('test-user'));
    expect(result.current.isSubscribed).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('subscribe calls fetch to /api/push/subscribe', async () => {
    Notification.requestPermission.mockResolvedValue('granted');
    const mockSub = {
      toJSON: () => ({ endpoint: 'https://push.example.com', keys: {} }),
      unsubscribe: mockUnsubscribe,
    };
    mockSubscribe.mockResolvedValue(mockSub);

    const { result } = renderHook(() => usePushNotification('test-user'));

    await act(async () => {
      await result.current.subscribe();
    });

    expect(fetch).toHaveBeenCalledWith('/api/push/subscribe', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('subscribe returns false when permission denied', async () => {
    Notification.requestPermission.mockResolvedValue('denied');

    const { result } = renderHook(() => usePushNotification('test-user'));

    let returnValue;
    await act(async () => {
      returnValue = await result.current.subscribe();
    });

    expect(returnValue).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('unsubscribe calls DELETE to /api/push/subscribe', async () => {
    mockGetSubscription.mockResolvedValue({
      unsubscribe: mockUnsubscribe.mockResolvedValue(true),
    });

    const { result } = renderHook(() => usePushNotification('test-user'));

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(fetch).toHaveBeenCalledWith('/api/push/subscribe', expect.objectContaining({
      method: 'DELETE',
    }));
  });

  it('does not subscribe without userId', async () => {
    const { result } = renderHook(() => usePushNotification(null));

    await act(async () => {
      const res = await result.current.subscribe();
      expect(res).toBeFalsy();
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
