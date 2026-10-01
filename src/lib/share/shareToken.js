import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 共有用グラフ画像の URL に付ける署名。
 *
 * LINE の画像メッセージは「誰でも GET できる HTTPS の URL」しか受け付けないので、
 * uid だけの URL にすると他人の体重推移が見えてしまう。
 * uid と有効期限を SHARE_LINK_SECRET（環境変数）で HMAC 署名し、改ざん・推測を防ぐ。
 *
 * 有効期限は LINE のトークを後から見返しても画像が出るよう長めにしてある。
 */

export const SHARE_LINK_TTL_DAYS = 30;

const getSecret = () => process.env.SHARE_LINK_SECRET || null;

export const isShareLinkConfigured = () => Boolean(getSecret());

const sign = (uid, exp, secret) => createHmac('sha256', secret)
    .update(`share-chart:${uid}:${exp}`)
    .digest('base64url');

/**
 * 署名付きのパス（/api/share/chart?...）を返す。秘密鍵が未設定なら null。
 */
export const createShareChartPath = (uid, { now = Date.now(), ttlDays = SHARE_LINK_TTL_DAYS } = {}) => {
    const secret = getSecret();
    if (!secret || !uid) return null;
    const exp = Math.floor(now / 1000) + ttlDays * 86400;
    const params = new URLSearchParams({ uid, exp: String(exp), sig: sign(uid, exp, secret) });
    return `/api/share/chart?${params.toString()}`;
};

export const verifyShareChartParams = ({ uid, exp, sig }, { now = Date.now() } = {}) => {
    const secret = getSecret();
    if (!secret || !uid || !exp || !sig) return false;

    const expNumber = Number(exp);
    if (!Number.isInteger(expNumber) || expNumber * 1000 < now) return false;

    const expected = Buffer.from(sign(uid, expNumber, secret));
    const actual = Buffer.from(String(sig));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
};

/**
 * LINE に渡す絶対 URL の土台。
 * APP_BASE_URL を優先し、無ければ Vercel が自動で入れる本番ドメインを使う。
 */
export const getAppBaseUrl = () => {
    const explicit = process.env.APP_BASE_URL;
    if (explicit) return explicit.replace(/\/+$/, '');
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (vercel) return `https://${vercel}`;
    return null;
};

export const createShareChartUrl = (uid, options) => {
    const path = createShareChartPath(uid, options);
    const base = getAppBaseUrl();
    return path && base ? `${base}${path}` : null;
};
