import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory Firestore mock: users/{uid}/lineStates/{sid}
const store = new Map();

const makeDocRef = (sid) => ({
  get: vi.fn(async () => ({
    exists: store.has(sid),
    data: () => store.get(sid),
    ref: { delete: vi.fn(async () => { store.delete(sid); }) },
  })),
  set: vi.fn(async (payload) => { store.set(sid, payload); }),
  delete: vi.fn(async () => { store.delete(sid); }),
});

vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: makeDocRef,
          get: vi.fn(async () => ({
            docs: [...store.entries()].map(([sid, data]) => ({
              data: () => data,
              ref: { delete: vi.fn(async () => { store.delete(sid); }) },
            })),
          })),
        })),
      })),
    })),
  },
}));

import {
  clearLineState,
  getActiveLineStates,
  getAwaitingCorrectionState,
  getLineStateBySid,
  isLineStateFresh,
  LINE_STATE_TTL_MS,
  setLineState,
} from '@/lib/line/state';

beforeEach(() => {
  store.clear();
});

describe('LINE conversation state TTL', () => {
  it('treats a recently updated state as fresh', () => {
    const now = Date.parse('2026-07-09T05:00:00.000Z');
    const state = { updatedAt: new Date(now - LINE_STATE_TTL_MS + 1000).toISOString() };
    expect(isLineStateFresh(state, now)).toBe(true);
  });

  it('treats an old state as expired', () => {
    const now = Date.parse('2026-07-09T05:00:00.000Z');
    const state = { updatedAt: new Date(now - LINE_STATE_TTL_MS - 1).toISOString() };
    expect(isLineStateFresh(state, now)).toBe(false);
  });
});

describe('sid-keyed concurrent states', () => {
  it('keeps multiple pending meals alive at the same time', async () => {
    await setLineState('uid-1', { pendingMeal: { foodName: 'カレー' }, mode: null, sid: 'sid-a' });
    await setLineState('uid-1', { pendingMeal: { foodName: 'サラダ' }, mode: null, sid: 'sid-b' });

    const stateA = await getLineStateBySid('uid-1', 'sid-a');
    const stateB = await getLineStateBySid('uid-1', 'sid-b');
    expect(stateA?.pendingMeal?.foodName).toBe('カレー');
    expect(stateB?.pendingMeal?.foodName).toBe('サラダ');
  });

  it('clears only the specified sid', async () => {
    await setLineState('uid-1', { pendingMeal: { foodName: 'カレー' }, mode: null, sid: 'sid-a' });
    await setLineState('uid-1', { pendingMeal: { foodName: 'サラダ' }, mode: null, sid: 'sid-b' });

    await clearLineState('uid-1', 'sid-a');

    expect(await getLineStateBySid('uid-1', 'sid-a')).toBeNull();
    expect((await getLineStateBySid('uid-1', 'sid-b'))?.pendingMeal?.foodName).toBe('サラダ');
  });

  it('removes expired states and returns fresh ones newest first', async () => {
    const now = Date.now();
    store.set('sid-old', { sid: 'sid-old', updatedAt: new Date(now - LINE_STATE_TTL_MS - 1000).toISOString() });
    store.set('sid-1', { sid: 'sid-1', updatedAt: new Date(now - 5000).toISOString() });
    store.set('sid-2', { sid: 'sid-2', updatedAt: new Date(now - 1000).toISOString() });

    const states = await getActiveLineStates('uid-1', now);

    expect(states.map(s => s.sid)).toEqual(['sid-2', 'sid-1']);
    expect(store.has('sid-old')).toBe(false);
  });

  it('finds the newest awaiting-correction state', async () => {
    const now = Date.now();
    store.set('sid-1', { sid: 'sid-1', pendingMeal: { foodName: 'カレー' }, mode: 'awaiting_correction', updatedAt: new Date(now - 5000).toISOString() });
    store.set('sid-2', { sid: 'sid-2', pendingMeal: { foodName: 'サラダ' }, mode: null, updatedAt: new Date(now - 1000).toISOString() });

    const state = await getAwaitingCorrectionState('uid-1', now);
    expect(state?.sid).toBe('sid-1');
  });

  it('returns null when a sid does not exist or is expired', async () => {
    expect(await getLineStateBySid('uid-1', 'missing')).toBeNull();

    const now = Date.now();
    store.set('sid-exp', { sid: 'sid-exp', updatedAt: new Date(now - LINE_STATE_TTL_MS - 1).toISOString() });
    expect(await getLineStateBySid('uid-1', 'sid-exp', now)).toBeNull();
  });
});
