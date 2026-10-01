import { db } from '@/lib/firebase/admin';
import { getJstDateId } from '@/lib/firebase/adminHelpers';
import { buildShareText, SHARE_TREND_DAYS, trendStartDateId } from '@/lib/share/shareReport';

const userRef = (uid) => db.collection('users').doc(uid);

/**
 * グラフ用の体組成を取得する。前回比のために期間の1件前まで欲しいので、
 * 日数ではなく件数で多めに取り、日付で絞るのは shareReport 側に任せる。
 */
export const getShareWeightsAdmin = async (uid, dateId, days = SHARE_TREND_DAYS) => {
    const snapshot = await userRef(uid).collection('weights')
        .where('date', '<=', dateId)
        .orderBy('date', 'desc')
        .limit(days + 10)
        .get();
    return (snapshot?.docs || []).map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
};

const getTodayCaloriesAdmin = async (uid, dateId) => {
    const start = new Date(`${dateId}T00:00:00+09:00`).toISOString();
    const end = new Date(`${dateId}T23:59:59+09:00`).toISOString();
    const snapshot = await userRef(uid).collection('meals')
        .where('timestamp', '>=', start)
        .where('timestamp', '<=', end)
        .get();
    const docs = snapshot?.docs || [];
    if (docs.length === 0) return null; // 記録なし（0kcal とは区別する）
    return docs.reduce((sum, doc) => sum + (Number(doc.data()?.calories) || 0), 0);
};

/** LINE から出力するときの共有テキスト（今日・JST） */
export const buildShareTextAdmin = async (uid, userData = {}, now = new Date()) => {
    const dateId = getJstDateId(now);
    const [totalCalories, weights] = await Promise.all([
        getTodayCaloriesAdmin(uid, dateId),
        getShareWeightsAdmin(uid, dateId),
    ]);
    const hasTrend = weights.some(entry => entry.date >= trendStartDateId(dateId));

    return {
        dateId,
        hasTrend,
        text: buildShareText({
            dateId,
            totalCalories,
            targetCalories: userData?.targetCalories ?? null,
            weights,
        }),
    };
};
