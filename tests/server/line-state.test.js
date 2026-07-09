import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({
  db: { collection: vi.fn() },
}));

import { isLineStateFresh, LINE_STATE_TTL_MS } from '@/lib/line/state';

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
