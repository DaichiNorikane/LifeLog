import { db } from '@/lib/firebase/admin';

export const LINE_STATE_TTL_MS = 10 * 60 * 1000;

// 写真の補足テキスト（「これを昼に食べた」等）を写真の到着まで覚えておく時間。
// 長すぎると全く別の写真に古い補足が付いてしまうので、通常の状態より短くする
export const PHOTO_CONTEXT_TTL_MS = 3 * 60 * 1000;

// sid（カードID）ごとに独立したドキュメントで保持する。
// 複数の写真・テキストを連続で送っても、それぞれの確認カードが並行して有効になる。
const statesRef = (uid) => db.collection('users').doc(uid).collection('lineStates');

const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    return 0;
};

export const isLineStateFresh = (state, now = Date.now()) => {
    const updatedAt = toMillis(state?.updatedAt);
    return Boolean(updatedAt && now - updatedAt <= LINE_STATE_TTL_MS);
};

export const getLineStateBySid = async (uid, sid, now = Date.now()) => {
    if (!sid) return null;
    const snap = await statesRef(uid).doc(sid).get();
    if (!snap.exists) return null;

    const state = snap.data() || {};
    if (!isLineStateFresh(state, now)) {
        await snap.ref.delete().catch(() => {});
        return null;
    }
    return state;
};

// 有効な状態を新しい順で返す。期限切れドキュメントはこのタイミングで掃除する
export const getActiveLineStates = async (uid, now = Date.now()) => {
    const snapshot = await statesRef(uid).get();
    const fresh = [];
    const staleRefs = [];

    for (const doc of snapshot.docs || []) {
        const state = doc.data() || {};
        if (isLineStateFresh(state, now)) {
            fresh.push(state);
        } else {
            staleRefs.push(doc.ref);
        }
    }

    if (staleRefs.length > 0) {
        await Promise.all(staleRefs.map(ref => ref.delete().catch(() => {})));
    }

    return fresh.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
};

// 「✏️ 修正する」タップ後の自由テキストをどのカードに紐付けるか（最新の修正待ちを採用）
export const getAwaitingCorrectionState = async (uid, now = Date.now()) => {
    const states = await getActiveLineStates(uid, now);
    return states.find(state => state.mode === 'awaiting_correction' && state.pendingMeal) || null;
};

/** 「キーワードで探す」を押したあと、次の発話を検索語として待っている状態 */
export const getAwaitingRecentSearchState = async (uid, now = Date.now()) => {
    const states = await getActiveLineStates(uid, now);
    return states.find(state => state.mode === 'awaiting_recent_search') || null;
};

/** 写真より先に補足テキストが届いていて、写真を待っている状態 */
export const getAwaitingPhotoContextState = async (uid, now = Date.now()) => {
    const states = await getActiveLineStates(uid, now);
    return states.find(state => state.mode === 'awaiting_photo_context'
        && state.contextText
        && now - toMillis(state.updatedAt) <= PHOTO_CONTEXT_TTL_MS) || null;
};

/** 一番新しい確認カード。写真直後のテキストをボタンなしで修正として扱うために使う */
export const getLatestPendingMealState = async (uid, now = Date.now()) => {
    const states = await getActiveLineStates(uid, now);
    return states.find(state => state.pendingMeal) || null;
};

export const setLineState = async (uid, state) => {
    if (!state?.sid) throw new Error('LINE state requires a sid');
    const payload = {
        pendingMeal: state.pendingMeal || null,
        pendingEdit: state.pendingEdit || null,
        mode: state.mode || null,
        contextText: state.contextText || null,
        sid: state.sid,
        updatedAt: new Date().toISOString(),
    };
    await statesRef(uid).doc(state.sid).set(payload, { merge: false });
    return payload;
};

export const clearLineState = async (uid, sid) => {
    if (!sid) return;
    await statesRef(uid).doc(sid).delete();
};
