"use server";

import { getAuth } from 'firebase-admin/auth';
import '@/lib/firebase/admin'; // Admin SDK の初期化
import { createShareChartPath } from '@/lib/share/shareToken';

/**
 * アプリ内の「LINE共有用に出力」から、推移グラフ画像の署名付きパスを発行する。
 *
 * uid をそのまま受け取ると誰でも他人のグラフ URL を作れてしまうので、
 * Firebase の ID トークンを検証して本人の uid にだけ署名する。
 * SHARE_LINK_SECRET が未設定なら null（画面ではテキストだけ出す）。
 */
export async function createShareChartPathAction(idToken) {
    if (!idToken) return null;
    try {
        const decoded = await getAuth().verifyIdToken(idToken);
        return createShareChartPath(decoded.uid);
    } catch (e) {
        console.error('Share chart token failed:', e.message);
        return null;
    }
}
