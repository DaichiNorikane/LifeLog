import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase/admin';
import { cleanData } from '@/utils/cleanData';
import { evaluateCondition, hasAnyScore } from '@/lib/health/conditionEngine';
import { getLogicalDateKey } from '@/lib/health/conditionDate';
import { AXES, AXIS_LABELS } from '@/lib/health/conditionRules';
import { buildEveningSleepNote } from '@/lib/health/conditionMessages';

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

const userRef = (uid) => db.collection('users').doc(uid);
const mealsRef = (uid) => userRef(uid).collection('meals');

/**
 * 相関分析用に体感ログをまとめて取得する（Admin SDK）。
 * 予測スナップショット（predicted / firedDrivers）と実測（主観スコア）が同じドキュメントに入っている。
 */
/**
 * その論理日のコンディションを算出して、LINE 用に要約する。
 * 決定論エンジンなので Gemini の追加呼び出しは発生しない。
 */
export const buildConditionContextAdmin = (meals = [], userProfile = {}, now = new Date()) => {
    const dateKey = getLogicalDateKey(now);
    const result = evaluateCondition({
        dateKey,
        meals,
        profile: {
            bedtime: userProfile?.bedtime,
            targetCalories: userProfile?.targetCalories,
            currentWeight: userProfile?.currentWeight,
        },
        now,
    });

    if (!hasAnyScore(result)) return null;

    const scores = {};
    for (const axis of AXES) {
        scores[axis] = result.axes?.[axis]?.score ?? null;
    }

    return {
        dateKey,
        scores,
        topNegative: result.topNegative
            ? { axis: result.topNegative.axis, label: result.topNegative.label, detail: result.topNegative.detail || null }
            : null,
        topPositive: result.topPositive
            ? { axis: result.topPositive.axis, label: result.topPositive.label, detail: result.topPositive.detail || null }
            : null,
        sleepNote: buildEveningSleepNote(result),
        result,
    };
};

export const getConditionLogsAdmin = async (uid, limitCount = 60) => {
    if (!uid) return [];
    try {
        const snapshot = await db.collection('users').doc(uid)
            .collection('conditionLogs')
            .orderBy('date', 'desc')
            .limit(limitCount)
            .get();
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error('[adminHelpers] getConditionLogsAdmin failed:', e.message);
        return [];
    }
};

/** 学習した個人係数を保存する（Admin SDK） */
export const saveConditionModelAdmin = async (uid, model) => {
    if (!uid || !model) return;
    try {
        await db.collection('users').doc(uid)
            .collection('insights').doc('conditionModel')
            .set({ ...model, updatedAt: new Date().toISOString() });
    } catch (e) {
        console.error('[adminHelpers] saveConditionModelAdmin failed:', e.message);
    }
};

export const findUserByLineId = async (lineUserId) => {
    if (!lineUserId) return null;
    const snapshot = await db.collection('users')
        .where('lineUserId', '==', lineUserId)
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {
        uid: doc.id,
        ref: doc.ref,
        data: doc.data() || {},
    };
};

export const addMealAdmin = async (uid, meal) => {
    const cleanedMeal = cleanData({
        ...meal,
        timestamp: meal.timestamp || new Date().toISOString(),
        image: meal.image || null,
    });
    const payload = {
        ...cleanedMeal,
        createdAt: FieldValue.serverTimestamp(),
    };

    const docRef = await mealsRef(uid).add(payload);
    return docRef.id;
};

const getJstDayRange = (date = new Date()) => {
    const dateId = getJstDateId(date);
    return {
        dateId,
        start: new Date(`${dateId}T00:00:00+09:00`).toISOString(),
        end: new Date(`${dateId}T23:59:59+09:00`).toISOString(),
    };
};

export const getJstDateId = (date = new Date()) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date(date))
        .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
};

export const addWeightAdmin = async (uid, weight, date = new Date()) => {
    const dateObj = new Date(date);
    const dateId = getJstDateId(dateObj);
    const payload = {
        weight: parseFloat(weight),
        date: dateId,
        timestamp: dateObj.toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    await userRef(uid).collection('weights').doc(dateId).set(payload, { merge: true });
    return { id: dateId, ...payload };
};

/** プロフィール（目標）の部分更新。LINE から目標を変えるときに使う */
export const updateUserProfileAdmin = async (uid, patch = {}) => {
    const clean = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    if (Object.keys(clean).length === 0) return null;

    await userRef(uid).set({ ...clean, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return clean;
};

/** 直近 days 日の「記録がある日」の平均摂取カロリー。目標診断の材料になる */
export const getRecentAverageCaloriesAdmin = async (uid, days = 7) => {
    const meals = await getRecentMealsAdmin(uid, { sinceMs: days * 24 * 60 * 60 * 1000, limit: 200 });
    if (meals.length === 0) return null;

    const byDate = new Map();
    for (const meal of meals) {
        const dateId = getJstDateId(new Date(meal.timestamp));
        byDate.set(dateId, (byDate.get(dateId) || 0) + (Number(meal.calories) || 0));
    }
    if (byDate.size === 0) return null;

    const total = [...byDate.values()].reduce((sum, value) => sum + value, 0);
    return Math.round(total / byDate.size);
};

export const getLatestWeightBefore = async (uid, dateId) => {
    const snapshot = await userRef(uid).collection('weights')
        .where('date', '<', dateId)
        .orderBy('date', 'desc')
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
};

const mapSnapshotDocs = (snapshot) => (snapshot?.docs || []).map(doc => ({
    id: doc.id,
    ...(doc.data() || {}),
}));

const uniqueIds = (ids = []) => [...new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean))];

export const getRecentMealsAdmin = async (uid, { sinceMs = 48 * 60 * 60 * 1000, limit = 30 } = {}) => {
    const sinceIso = new Date(Date.now() - sinceMs).toISOString();
    const snapshot = await mealsRef(uid)
        .where('timestamp', '>=', sinceIso)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
    return mapSnapshotDocs(snapshot);
};

/** 履歴として読みにいく上限。これを超えて古い記録は検索対象にしない */
const RECENT_MEALS_SCAN_LIMIT = 300;

/**
 * 履歴から登録するための「よく食べたもの」一覧。
 *
 * 同じ料理を何度も記録していることが多いので、料理名で重複を除いて新しい順に返す。
 * Firestore は部分一致検索ができないため、直近をまとめて読んでメモリ上で絞り込む。
 *
 * @returns {{meals: Array, total: number}} total は絞り込み後の全件数（続きがあるかの判定に使う）
 */
export const getRecentUniqueMealsAdmin = async (uid, { limit = 10, offset = 0, query = '' } = {}) => {
    const snapshot = await mealsRef(uid)
        .orderBy('timestamp', 'desc')
        .limit(RECENT_MEALS_SCAN_LIMIT)
        .get();

    const keyword = String(query || '').trim().toLowerCase();
    const seen = new Set();
    const unique = [];

    for (const doc of snapshot.docs) {
        const data = doc.data() || {};
        const name = String(data.foodName || '').trim();
        if (!name) continue;

        // 大文字小文字の違いで同じ料理が二重に並ばないようにする
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        if (keyword && !key.includes(keyword)) continue;

        seen.add(key);
        unique.push({ id: doc.id, ...data });
    }

    return {
        meals: unique.slice(offset, offset + limit),
        total: unique.length,
    };
};

/** 1件だけ取り出す（履歴から登録するときに元の栄養素をコピーするため） */
export const getMealByIdAdmin = async (uid, mealId) => {
    const doc = await mealsRef(uid).doc(mealId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
};

export const deleteMealsAdmin = async (uid, ids = []) => {
    const idsToDelete = uniqueIds(ids);
    await Promise.all(idsToDelete.map(id => mealsRef(uid).doc(id).delete()));
    return idsToDelete.length;
};

export const updateMealsTypeAdmin = async (uid, ids = [], mealType) => {
    if (!VALID_MEAL_TYPES.has(mealType)) {
        throw new Error(`Invalid mealType: ${mealType}`);
    }
    const idsToUpdate = uniqueIds(ids);
    await Promise.all(idsToUpdate.map(id => mealsRef(uid).doc(id).update({ mealType })));
    return idsToUpdate.length;
};

// 全食事で値が未取得（null）の場合は 0 ではなく null を返す（null/0の区別を保持）
const sumMacro = (meals, key) => {
    let sum = 0;
    let hasValue = false;
    for (const meal of meals) {
        const value = meal?.macros?.[key];
        if (typeof value === 'number') {
            sum += value;
            hasValue = true;
        }
    }
    return hasValue ? sum : null;
};

export const getLineChatContextAdmin = async (uid, userData = {}, date = new Date()) => {
    const userDocRef = userRef(uid);
    const { dateId, start, end } = getJstDayRange(date);

    const [
        userDoc,
        mealsSnap,
        weightsSnap,
        stockSnap,
        dailyEvalSnap,
        messagesSnap,
    ] = await Promise.all([
        userDocRef.get(),
        userDocRef.collection('meals')
            .where('timestamp', '>=', start)
            .where('timestamp', '<=', end)
            .get(),
        userDocRef.collection('weights')
            .orderBy('date', 'desc')
            .limit(2)
            .get(),
        userDocRef.collection('stockItems').get(),
        userDocRef.collection('daily_evaluations')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get(),
        userDocRef.collection('lineMessages')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get(),
    ]);

    const userProfile = {
        ...(userDoc?.exists ? (userDoc.data() || {}) : {}),
        ...(userData || {}),
    };
    const meals = mapSnapshotDocs(mealsSnap);
    const totalCalories = meals.reduce((sum, meal) => sum + (Number(meal.calories) || 0), 0);
    const targetCalories = Number(userProfile.targetCalories) || 2000;

    return {
        uid,
        user: {
            targetCalories,
            currentWeight: userProfile.currentWeight ?? null,
            targetWeight: userProfile.targetWeight ?? null,
            targetDate: userProfile.targetDate ?? null,
        },
        today: {
            dateId,
            start,
            end,
            meals,
            totalCalories,
            remainingCalories: targetCalories - totalCalories,
            totalMacros: {
                protein: sumMacro(meals, 'protein'),
                fat: sumMacro(meals, 'fat'),
                carbs: sumMacro(meals, 'carbs'),
                fiber: sumMacro(meals, 'fiber'),
                sugar: sumMacro(meals, 'sugar'),
                sodium: sumMacro(meals, 'sodium'),
                potassium: sumMacro(meals, 'potassium'),
            },
        },
        recentWeights: mapSnapshotDocs(weightsSnap),
        stockItems: mapSnapshotDocs(stockSnap).map(item => ({ name: item.name })).filter(item => item.name),
        latestDailyEvaluation: mapSnapshotDocs(dailyEvalSnap)[0] || null,
        // コンディション予測（決定論エンジン。API呼び出しなし）
        condition: buildConditionContextAdmin(meals, userProfile, date),
        messageHistory: mapSnapshotDocs(messagesSnap).reverse().map(message => ({
            role: message.role,
            text: message.text,
            createdAt: message.createdAt || null,
        })),
    };
};

const lineMessagesRef = (uid) => userRef(uid).collection('lineMessages');

export const pruneLineMessagesAdmin = async (uid, maxMessages = 50) => {
    const snapshot = await lineMessagesRef(uid).orderBy('createdAt', 'asc').get();
    const excessCount = Math.max(0, (snapshot.docs || []).length - maxMessages);
    if (excessCount === 0) return 0;

    const docsToDelete = snapshot.docs.slice(0, excessCount);
    await Promise.all(docsToDelete.map(doc => doc.ref.delete()));
    return docsToDelete.length;
};

export const saveLineChatExchangeAdmin = async (uid, userText, assistantText) => {
    const ref = lineMessagesRef(uid);
    await ref.add({
        role: 'user',
        text: String(userText || ''),
        createdAt: FieldValue.serverTimestamp(),
    });
    await ref.add({
        role: 'assistant',
        text: String(assistantText || ''),
        createdAt: FieldValue.serverTimestamp(),
    });
    await pruneLineMessagesAdmin(uid, 50);
};

export const saveLineAssistantMessageAdmin = async (uid, text) => {
    await lineMessagesRef(uid).add({
        role: 'assistant',
        text: String(text || ''),
        createdAt: FieldValue.serverTimestamp(),
    });
    await pruneLineMessagesAdmin(uid, 50);
};
