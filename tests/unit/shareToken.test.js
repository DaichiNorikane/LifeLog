import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createShareChartPath, createShareChartUrl, getAppBaseUrl, verifyShareChartParams,
} from '@/lib/share/shareToken';

const parse = (path) => Object.fromEntries(new URLSearchParams(path.split('?')[1]));
const env = { ...process.env };

beforeEach(() => {
  process.env.SHARE_LINK_SECRET = 'test-secret';
  delete process.env.APP_BASE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});
afterEach(() => { process.env = { ...env }; });

describe('shareToken', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');

  it('署名したパスは検証を通る', () => {
    const path = createShareChartPath('uid-1', { now });
    expect(path.startsWith('/api/share/chart?')).toBe(true);
    expect(verifyShareChartParams(parse(path), { now })).toBe(true);
  });

  it('uid を差し替えると通らない', () => {
    const params = parse(createShareChartPath('uid-1', { now }));
    expect(verifyShareChartParams({ ...params, uid: 'uid-2' }, { now })).toBe(false);
  });

  it('期限切れは通らない', () => {
    const params = parse(createShareChartPath('uid-1', { now, ttlDays: 1 }));
    expect(verifyShareChartParams(params, { now: now + 2 * 86400000 })).toBe(false);
  });

  it('秘密鍵が未設定なら発行も検証もしない', () => {
    const params = parse(createShareChartPath('uid-1', { now }));
    delete process.env.SHARE_LINK_SECRET;
    expect(createShareChartPath('uid-1', { now })).toBeNull();
    expect(verifyShareChartParams(params, { now })).toBe(false);
  });

  it('公開 URL は APP_BASE_URL を優先し、無ければ Vercel の本番ドメイン', () => {
    expect(getAppBaseUrl()).toBeNull();
    expect(createShareChartUrl('uid-1', { now })).toBeNull();
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'lifelog.example.app';
    expect(getAppBaseUrl()).toBe('https://lifelog.example.app');
    process.env.APP_BASE_URL = 'https://my.example.com/';
    expect(createShareChartUrl('uid-1', { now })).toMatch(/^https:\/\/my\.example\.com\/api\/share\/chart\?/);
  });
});
