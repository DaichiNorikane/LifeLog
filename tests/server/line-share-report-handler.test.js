import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replyOrPushMessage: vi.fn().mockResolvedValue({ success: true }),
  mealsGet: vi.fn(),
  weightsGet: vi.fn(),
}));

vi.mock('@/lib/line/client', () => ({ replyOrPushMessage: mocks.replyOrPushMessage }));
vi.mock('@/lib/firebase/adminHelpers', () => ({ getJstDateId: () => '2026-10-01' }));
vi.mock('@/lib/firebase/admin', () => ({
  db: {
    collection: () => ({
      doc: () => ({
        collection: (name) => {
          const chain = {
            where: () => chain,
            orderBy: () => chain,
            limit: () => chain,
            get: () => (name === 'meals' ? mocks.mealsGet() : mocks.weightsGet()),
          };
          return chain;
        },
      }),
    }),
  },
}));

import {
  handleShareReportEvent, isShareReportText, withShareQuickReply,
} from '@/lib/line/handlers/share-report';

const docs = (rows) => ({ docs: rows.map((row, i) => ({ id: String(i), data: () => row })) });
const event = { replyToken: 'token', source: { userId: 'line-1' } };
const user = { uid: 'uid-1', data: { targetCalories: 2000 } };
const env = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SHARE_LINK_SECRET = 'secret';
  process.env.APP_BASE_URL = 'https://lifelog.example.app';
  mocks.mealsGet.mockResolvedValue(docs([{ calories: 600 }, { calories: 1220 }]));
  mocks.weightsGet.mockResolvedValue(docs([
    { date: '2026-10-01', weight: 74.3, bodyFat: 22.1 },
    { date: '2026-09-30', weight: 74.5, bodyFat: 22.3 },
  ]));
});
afterEach(() => { process.env = { ...env }; });

describe('isShareReportText', () => {
  it.each(['共有', 'LINE共有用に出力', '共有用', '共有出力'])('%s を拾う', (text) => {
    expect(isShareReportText(text)).toBe(true);
  });
  it.each(['共有して欲しい', 'カレーを共有'])('%s は拾わない', (text) => {
    expect(isShareReportText(text)).toBe(false);
  });
});

describe('handleShareReportEvent', () => {
  it('共有テキストと署名付きのグラフ画像を返す', async () => {
    const result = await handleShareReportEvent(event, user, { now: new Date('2026-10-01T03:00:00Z') });
    const [, messages] = mocks.replyOrPushMessage.mock.calls[0];

    expect(result.image).toBe(true);
    expect(messages[0].type).toBe('text');
    expect(messages[0].text).toContain('摂取カロリー: 1,820 / 2,000 kcal');
    expect(messages[0].text).toContain('体重: 74.3 kg（前回比 -0.2 kg）');
    expect(messages[1].type).toBe('image');
    expect(messages[1].originalContentUrl).toMatch(/^https:\/\/lifelog\.example\.app\/api\/share\/chart\?uid=uid-1&exp=\d+&sig=/);
    expect(messages[1].previewImageUrl).toBe(messages[1].originalContentUrl);
  });

  it('秘密鍵が未設定ならテキストだけ返す', async () => {
    delete process.env.SHARE_LINK_SECRET;
    const result = await handleShareReportEvent(event, user);
    const [, messages] = mocks.replyOrPushMessage.mock.calls[0];
    expect(result.image).toBe(false);
    expect(messages).toHaveLength(1);
  });

  it('期間内に体組成が無ければ画像は付けない', async () => {
    mocks.weightsGet.mockResolvedValue(docs([]));
    mocks.mealsGet.mockResolvedValue(docs([]));
    await handleShareReportEvent(event, user);
    const [, messages] = mocks.replyOrPushMessage.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain('摂取カロリー: 未記録');
  });
});

describe('withShareQuickReply', () => {
  it('postback のクイックリプライを付ける', () => {
    const message = withShareQuickReply({ type: 'text', text: 'x' });
    expect(message.quickReply.items[0].action).toMatchObject({ type: 'postback', data: 'action=share_report', label: 'LINE共有用に出力' });
  });
});
