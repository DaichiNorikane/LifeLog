import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const serverTimestampSentinel = { __fieldValue: 'serverTimestamp' };
  return {
    serverTimestampSentinel,
    serverTimestamp: vi.fn(() => serverTimestampSentinel),
    dbCollection: vi.fn(),
    userDoc: vi.fn(),
    userCollection: vi.fn(),
    userGet: vi.fn(),
    mealsWhereFirst: vi.fn(),
    mealsWhereSecond: vi.fn(),
    mealsGet: vi.fn(),
    weightsOrderBy: vi.fn(),
    weightsLimit: vi.fn(),
    weightsGet: vi.fn(),
    stockGet: vi.fn(),
    dailyOrderBy: vi.fn(),
    dailyLimit: vi.fn(),
    dailyGet: vi.fn(),
    messagesOrderBy: vi.fn(),
    messagesLimit: vi.fn(),
    messagesGet: vi.fn(),
    messagesAdd: vi.fn(),
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

import {
  getLineChatContextAdmin,
  pruneLineMessagesAdmin,
  saveLineChatExchangeAdmin,
} from '@/lib/firebase/adminHelpers';

const doc = (id, data, extra = {}) => ({
  id,
  data: () => data,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serverTimestamp.mockReturnValue(mocks.serverTimestampSentinel);
  mocks.userGet.mockResolvedValue({
    exists: true,
    data: () => ({
      targetCalories: 1900,
      currentWeight: 65.4,
      targetWeight: 62,
      targetDate: '2026-09-01',
    }),
  });
  mocks.mealsGet.mockResolvedValue({
    docs: [
      doc('meal-1', { foodName: '朝食', calories: 350, macros: { protein: 20, fat: 8, carbs: 45 } }),
      doc('meal-2', { foodName: 'プロテイン', calories: 120, macros: { protein: 24, fat: 1, carbs: 4 } }),
    ],
  });
  mocks.weightsGet.mockResolvedValue({
    docs: [
      doc('2026-07-09', { date: '2026-07-09', weight: 65.4 }),
      doc('2026-07-08', { date: '2026-07-08', weight: 65.8 }),
    ],
  });
  mocks.stockGet.mockResolvedValue({
    docs: [doc('stock-1', { name: '鶏むね肉' }), doc('stock-2', { name: '卵' })],
  });
  mocks.dailyGet.mockResolvedValue({
    docs: [doc('eval-1', { score: 78, title: '惜しい！', advice: '脂質を抑えよう' })],
  });
  mocks.messagesGet.mockResolvedValue({
    docs: [
      doc('msg-new', { role: 'assistant', text: '夜は軽めで行こ！', createdAt: '2026-07-09T02:00:00.000Z' }),
      doc('msg-old', { role: 'user', text: '夕食どうする？', createdAt: '2026-07-09T01:00:00.000Z' }),
    ],
  });
  mocks.messagesAdd.mockResolvedValue({ id: 'line-message-1' });

  mocks.mealsWhereFirst.mockReturnValue({ where: mocks.mealsWhereSecond });
  mocks.mealsWhereSecond.mockReturnValue({ get: mocks.mealsGet });
  mocks.weightsOrderBy.mockReturnValue({ limit: mocks.weightsLimit });
  mocks.weightsLimit.mockReturnValue({ get: mocks.weightsGet });
  mocks.dailyOrderBy.mockReturnValue({ limit: mocks.dailyLimit });
  mocks.dailyLimit.mockReturnValue({ get: mocks.dailyGet });
  mocks.messagesOrderBy.mockReturnValue({
    limit: mocks.messagesLimit,
    get: mocks.messagesGet,
  });
  mocks.messagesLimit.mockReturnValue({ get: mocks.messagesGet });

  mocks.userCollection.mockImplementation((name) => {
    if (name === 'meals') return { where: mocks.mealsWhereFirst };
    if (name === 'weights') return { orderBy: mocks.weightsOrderBy };
    if (name === 'stockItems') return { get: mocks.stockGet };
    if (name === 'daily_evaluations') return { orderBy: mocks.dailyOrderBy };
    if (name === 'lineMessages') return { orderBy: mocks.messagesOrderBy, add: mocks.messagesAdd };
    return {};
  });
  mocks.userDoc.mockReturnValue({
    get: mocks.userGet,
    collection: mocks.userCollection,
  });
  mocks.dbCollection.mockImplementation((name) => {
    if (name === 'users') return { doc: mocks.userDoc };
    return {};
  });
});

describe('line chat admin helpers', () => {
  it('collects line chat context with meals, targets, weights, stock, evaluation, and history', async () => {
    const context = await getLineChatContextAdmin('uid-1', { targetCalories: 2000 }, new Date('2026-07-09T00:00:00.000Z'));

    expect(mocks.mealsWhereFirst).toHaveBeenCalledWith('timestamp', '>=', '2026-07-08T15:00:00.000Z');
    expect(mocks.mealsWhereSecond).toHaveBeenCalledWith('timestamp', '<=', '2026-07-09T14:59:59.000Z');
    expect(mocks.weightsOrderBy).toHaveBeenCalledWith('date', 'desc');
    expect(mocks.weightsLimit).toHaveBeenCalledWith(2);
    expect(mocks.messagesOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(mocks.messagesLimit).toHaveBeenCalledWith(20);

    expect(context.user.targetCalories).toBe(2000);
    expect(context.today.totalCalories).toBe(470);
    expect(context.today.remainingCalories).toBe(1530);
    expect(context.today.totalMacros).toEqual(expect.objectContaining({ protein: 44, fat: 9, carbs: 49 }));
    expect(context.stockItems).toEqual([{ name: '鶏むね肉' }, { name: '卵' }]);
    expect(context.latestDailyEvaluation).toEqual(expect.objectContaining({ score: 78, title: '惜しい！' }));
    expect(context.messageHistory.map(message => message.text)).toEqual(['夕食どうする？', '夜は軽めで行こ！']);
  });

  it('saves user and assistant messages before pruning history', async () => {
    mocks.messagesGet.mockResolvedValue({ docs: [] });

    await saveLineChatExchangeAdmin('uid-1', '夕食を提案して！', '残り1530kcalだから鶏むねで行こ！');

    expect(mocks.messagesAdd).toHaveBeenNthCalledWith(1, {
      role: 'user',
      text: '夕食を提案して！',
      createdAt: mocks.serverTimestampSentinel,
    });
    expect(mocks.messagesAdd).toHaveBeenNthCalledWith(2, {
      role: 'assistant',
      text: '残り1530kcalだから鶏むねで行こ！',
      createdAt: mocks.serverTimestampSentinel,
    });
  });

  it('deletes oldest lineMessages when history exceeds 50 messages', async () => {
    const deleteFns = Array.from({ length: 53 }, () => vi.fn().mockResolvedValue(undefined));
    mocks.messagesGet.mockResolvedValue({
      docs: deleteFns.map((deleteFn, index) => doc(`msg-${index}`, { text: `message-${index}` }, { ref: { delete: deleteFn } })),
    });

    const deleted = await pruneLineMessagesAdmin('uid-1', 50);

    expect(deleted).toBe(3);
    expect(mocks.messagesOrderBy).toHaveBeenCalledWith('createdAt', 'asc');
    expect(deleteFns[0]).toHaveBeenCalledTimes(1);
    expect(deleteFns[1]).toHaveBeenCalledTimes(1);
    expect(deleteFns[2]).toHaveBeenCalledTimes(1);
    expect(deleteFns[3]).not.toHaveBeenCalled();
  });
});
