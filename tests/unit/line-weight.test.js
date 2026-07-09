import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/adminHelpers', () => ({
  addWeightAdmin: vi.fn(),
  getLatestWeightBefore: vi.fn(),
}));

vi.mock('@/lib/line/client', () => ({
  replyOrPushMessage: vi.fn(),
}));

vi.mock('@/lib/line/resolveUser', () => ({
  resolveUserOrReply: vi.fn(),
}));

import { parseWeightText, WEIGHT_TEXT_RE } from '@/lib/line/handlers/weight';

describe('LINE weight parsing', () => {
  it('accepts plain decimal weight', () => {
    expect(WEIGHT_TEXT_RE.test('65.2')).toBe(true);
    expect(parseWeightText('65.2')).toBe(65.2);
  });

  it('accepts prefixed kg weight', () => {
    expect(WEIGHT_TEXT_RE.test('体重65.2kg')).toBe(true);
    expect(parseWeightText('体重65.2kg')).toBe(65.2);
  });

  it('rejects text with leading non-weight characters', () => {
    expect(WEIGHT_TEXT_RE.test('あ65.2')).toBe(false);
    expect(parseWeightText('あ65.2')).toBeNull();
  });

  it('rejects values outside the valid range', () => {
    expect(WEIGHT_TEXT_RE.test('300')).toBe(true);
    expect(parseWeightText('300')).toBeNull();
  });
});
