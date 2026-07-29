/**
 * Tests for the conditionLogs helpers in src/lib/firebase/firestore.js
 */

const mockDocSnap = {
  exists: vi.fn(() => true),
  data: vi.fn(() => ({ date: '2026-07-29', sleep: { subjective: 4 } })),
  id: '2026-07-29',
};

const mockQuerySnap = {
  docs: [
    { id: '2026-07-29', data: () => ({ date: '2026-07-29' }) },
    { id: '2026-07-28', data: () => ({ date: '2026-07-28' }) },
  ],
  empty: false,
  size: 2,
};

vi.mock('@/lib/firebase/config', () => ({ db: {} }));

const mockGetDocs = vi.fn(() => Promise.resolve(mockQuerySnap));
const mockGetDoc = vi.fn(() => Promise.resolve(mockDocSnap));
const mockSetDoc = vi.fn(() => Promise.resolve());
const mockDoc = vi.fn(() => 'docRef');

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'colRef'),
  addDoc: vi.fn(() => Promise.resolve({ id: 'newDoc1' })),
  getDocs: (...args) => mockGetDocs(...args),
  query: vi.fn(() => 'queryRef'),
  where: vi.fn(),
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  limit: vi.fn((...args) => ({ limit: args })),
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(),
  Timestamp: { now: vi.fn(() => ({ seconds: 123, nanoseconds: 0 })) },
}));

import {
  saveConditionLog,
  saveConditionCheckIn,
  saveConditionPrediction,
  getConditionLog,
  getConditionLogs,
} from '@/lib/firebase/firestore';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDoc.mockResolvedValue(mockDocSnap);
  mockGetDocs.mockResolvedValue(mockQuerySnap);
  mockSetDoc.mockResolvedValue(undefined);
  mockDocSnap.exists.mockReturnValue(true);
});

describe('saveConditionLog', () => {
  it('merges into users/{uid}/conditionLogs/{date}', async () => {
    await saveConditionLog('u1', '2026-07-29', { note: 'よく寝た' });

    expect(mockDoc).toHaveBeenCalledWith({}, 'users', 'u1', 'conditionLogs', '2026-07-29');
    const [, payload, options] = mockSetDoc.mock.calls[0];
    expect(payload).toMatchObject({ date: '2026-07-29', note: 'よく寝た' });
    expect(options).toEqual({ merge: true });
  });

  it('does nothing without a uid or date key', async () => {
    await saveConditionLog(null, '2026-07-29', { note: 'x' });
    await saveConditionLog('u1', null, { note: 'x' });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('propagates write errors so the UI can roll back', async () => {
    mockSetDoc.mockRejectedValue(new Error('offline'));
    await expect(saveConditionLog('u1', '2026-07-29', { note: 'x' })).rejects.toThrow('offline');
  });
});

describe('saveConditionCheckIn', () => {
  it('stores the subjective value with a timestamp', async () => {
    await saveConditionCheckIn('u1', '2026-07-29', 'focus', 4);

    const [, payload] = mockSetDoc.mock.calls[0];
    expect(payload.focus.subjective).toBe(4);
    expect(payload.focus.recordedAt).toEqual(expect.any(String));
  });

  it('marks sleep entries as manual so HealthKit data can merge later', async () => {
    await saveConditionCheckIn('u1', '2026-07-29', 'sleep', 3);

    const [, payload] = mockSetDoc.mock.calls[0];
    expect(payload.sleep.source).toBe('manual');
  });

  it('does not add a source to non-sleep axes', async () => {
    await saveConditionCheckIn('u1', '2026-07-29', 'focus', 3);

    const [, payload] = mockSetDoc.mock.calls[0];
    expect(payload.focus).not.toHaveProperty('source');
  });

  it('accepts null to clear an answer', async () => {
    await saveConditionCheckIn('u1', '2026-07-29', 'focus', null);

    const [, payload] = mockSetDoc.mock.calls[0];
    expect(payload.focus.subjective).toBeNull();
  });

  it.each([0, 6, -1, 'たくさん', NaN])('rejects out-of-range value: %s', async (value) => {
    await expect(saveConditionCheckIn('u1', '2026-07-29', 'focus', value)).rejects.toThrow();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

describe('saveConditionPrediction', () => {
  it('snapshots the predicted scores with the engine version', async () => {
    const predicted = { focus: 72, sleep: 38, energy: 61, mood: null };
    await saveConditionPrediction('u1', '2026-07-29', predicted, 1);

    const [, payload] = mockSetDoc.mock.calls[0];
    expect(payload.predicted).toEqual(predicted);
    expect(payload.engineVersion).toBe(1);
  });
});

describe('getConditionLog', () => {
  it('returns the document with its id', async () => {
    const log = await getConditionLog('u1', '2026-07-29');
    expect(log).toMatchObject({ id: '2026-07-29', sleep: { subjective: 4 } });
  });

  it('returns null when the day has no log', async () => {
    mockDocSnap.exists.mockReturnValue(false);
    expect(await getConditionLog('u1', '2026-07-29')).toBeNull();
  });

  it('returns null without a uid', async () => {
    expect(await getConditionLog(null, '2026-07-29')).toBeNull();
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('returns null instead of throwing on read failure', async () => {
    mockGetDoc.mockRejectedValue(new Error('offline'));
    expect(await getConditionLog('u1', '2026-07-29')).toBeNull();
  });
});

describe('getConditionLogs', () => {
  it('returns logs newest first', async () => {
    const logs = await getConditionLogs('u1');
    expect(logs).toHaveLength(2);
    expect(logs[0].id).toBe('2026-07-29');
  });

  it('returns an empty array without a uid', async () => {
    expect(await getConditionLogs(null)).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('returns an empty array instead of throwing on read failure', async () => {
    mockGetDocs.mockRejectedValue(new Error('offline'));
    expect(await getConditionLogs('u1')).toEqual([]);
  });
});
