import { db } from '@/lib/firebase/admin';

export const LINE_STATE_TTL_MS = 10 * 60 * 1000;

const stateRef = (uid) => db.collection('users').doc(uid).collection('lineState').doc('current');

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

export const getActiveLineState = async (uid, now = Date.now()) => {
    const snap = await stateRef(uid).get();
    if (!snap.exists) return null;

    const state = snap.data() || {};
    if (!isLineStateFresh(state, now)) {
        await stateRef(uid).delete().catch(() => {});
        return null;
    }
    return state;
};

export const setLineState = async (uid, state) => {
    const payload = {
        pendingMeal: state.pendingMeal || null,
        pendingEdit: state.pendingEdit || null,
        mode: state.mode || null,
        sid: state.sid,
        updatedAt: new Date().toISOString(),
    };
    await stateRef(uid).set(payload, { merge: false });
    return payload;
};

export const clearLineState = async (uid) => {
    await stateRef(uid).delete();
};
