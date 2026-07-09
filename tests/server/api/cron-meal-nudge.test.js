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
  dbCollection: vi.fn(),
  usersGet: vi.fn(),
  userDoc: vi.fn(),
  userCollection: vi.fn(),
  mealsWhereFirst: vi.fn(),
  mealsWhereSecond: vi.fn(),
  mealsGet: vi.fn(),
  pushMessage: vi.fn(),
  getJstDateId: vi.fn(() => '2026-07-10'),
  saveLineAssistantMessageAdmin: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: mocks.dbCollection,
  },
}));

vi.mock('@/lib/firebase/adminHelpers', () => ({
  getJstDateId: mocks.getJstDateId,
  saveLineAssistantMessageAdmin: mocks.saveLineAssistantMessageAdmin,
}));

vi.mock('@/lib/line/client', () => ({
  pushMessage: mocks.pushMessage,
}));

const request = (url = 'http://localhost/api/cron/meal-nudge?meal=breakfast', headers = {}) => ({
  url,
  headers: new Headers(headers),
});

const userDoc = (id, data) => ({
  id,
  data: () => data,
});

const mealDoc = (data) => ({
  data: () => data,
});

describe('GET /api/cron/meal-nudge', () => {
  let GET;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };

    mocks.getJstDateId.mockReturnValue('2026-07-10');
    mocks.pushMessage.mockResolvedValue({ success: true });
    mocks.saveLineAssistantMessageAdmin.mockResolvedValue(undefined);
    mocks.mealsWhereFirst.mockReturnValue({ where: mocks.mealsWhereSecond });
    mocks.mealsWhereSecond.mockReturnValue({ get: mocks.mealsGet });
    mocks.userCollection.mockImplementation((name) => {
      if (name === 'meals') return { where: mocks.mealsWhereFirst };
      return {};
    });
    mocks.userDoc.mockReturnValue({ collection: mocks.userCollection });
    mocks.dbCollection.mockImplementation((name) => {
      if (name === 'users') return { get: mocks.usersGet, doc: mocks.userDoc };
      return {};
    });

    const mod = await import('@/app/api/cron/meal-nudge/route.js');
    GET = mod.GET;
  });

  it('rejects bad authorization in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = 'real-secret';

    const res = await GET(request('http://localhost/api/cron/meal-nudge?meal=breakfast', {
      authorization: 'Bearer wrong',
    }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.dbCollection).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid meal query', async () => {
    const res = await GET(request('http://localhost/api/cron/meal-nudge?meal=snack'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid meal' });
    expect(mocks.usersGet).not.toHaveBeenCalled();
  });

  it('pushes and saves a nudge for linked users without the target meal', async () => {
    mocks.usersGet.mockResolvedValue({
      docs: [userDoc('uid-1', { lineUserId: 'line-1' })],
    });
    mocks.mealsGet.mockResolvedValue({ docs: [] });

    const res = await GET(request('http://localhost/api/cron/meal-nudge?meal=breakfast'));
    const data = await res.json();

    expect(data).toEqual({ success: true, meal: 'breakfast', nudged: 1, skipped: 0 });
    expect(mocks.mealsWhereFirst).toHaveBeenCalledWith('timestamp', '>=', '2026-07-09T15:00:00.000Z');
    expect(mocks.mealsWhereSecond).toHaveBeenCalledWith('timestamp', '<=', '2026-07-10T14:59:59.000Z');
    expect(mocks.pushMessage).toHaveBeenCalledWith('line-1', expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('朝ごはんの記録がまだ'),
    }));
    const text = mocks.pushMessage.mock.calls[0][1].text;
    expect(text).toContain('写真か');
    expect(text).toContain('体調と気分');
    expect(mocks.saveLineAssistantMessageAdmin).toHaveBeenCalledWith('uid-1', text);
  });

  it('skips linked users who already recorded the target meal', async () => {
    mocks.usersGet.mockResolvedValue({
      docs: [userDoc('uid-1', { lineUserId: 'line-1' })],
    });
    mocks.mealsGet.mockResolvedValue({
      docs: [mealDoc({ mealType: 'lunch', foodName: '牛丼' })],
    });

    const res = await GET(request('http://localhost/api/cron/meal-nudge?meal=lunch'));
    const data = await res.json();

    expect(data).toEqual({ success: true, meal: 'lunch', nudged: 0, skipped: 1 });
    expect(mocks.pushMessage).not.toHaveBeenCalled();
    expect(mocks.saveLineAssistantMessageAdmin).not.toHaveBeenCalled();
  });

  it('skips users without lineUserId before querying meals', async () => {
    mocks.usersGet.mockResolvedValue({
      docs: [userDoc('uid-1', { targetCalories: 1800 })],
    });

    const res = await GET(request('http://localhost/api/cron/meal-nudge?meal=dinner'));
    const data = await res.json();

    expect(data).toEqual({ success: true, meal: 'dinner', nudged: 0, skipped: 1 });
    expect(mocks.mealsGet).not.toHaveBeenCalled();
    expect(mocks.pushMessage).not.toHaveBeenCalled();
  });

  it('continues with other users when a push fails', async () => {
    mocks.usersGet.mockResolvedValue({
      docs: [
        userDoc('uid-1', { lineUserId: 'line-1' }),
        userDoc('uid-2', { lineUserId: 'line-2' }),
      ],
    });
    mocks.mealsGet
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });
    mocks.pushMessage
      .mockResolvedValueOnce({ error: 'blocked' })
      .mockResolvedValueOnce({ success: true });

    const res = await GET(request('http://localhost/api/cron/meal-nudge?meal=lunch'));
    const data = await res.json();

    expect(data).toEqual({ success: true, meal: 'lunch', nudged: 1, skipped: 0 });
    expect(mocks.pushMessage).toHaveBeenCalledTimes(2);
    expect(mocks.saveLineAssistantMessageAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.saveLineAssistantMessageAdmin.mock.calls[0][0]).toBe('uid-2');
  });
});
