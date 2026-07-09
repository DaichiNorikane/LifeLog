import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase/admin';
import { cleanData } from '@/utils/cleanData';

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

    const docRef = await db.collection('users').doc(uid).collection('meals').add(payload);
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

    await db.collection('users').doc(uid).collection('weights').doc(dateId).set(payload, { merge: true });
    return { id: dateId, ...payload };
};

export const getLatestWeightBefore = async (uid, dateId) => {
    const snapshot = await db.collection('users').doc(uid).collection('weights')
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
    const userRef = db.collection('users').doc(uid);
    const { dateId, start, end } = getJstDayRange(date);

    const [
        userDoc,
        mealsSnap,
        weightsSnap,
        stockSnap,
        dailyEvalSnap,
        messagesSnap,
    ] = await Promise.all([
        userRef.get(),
        userRef.collection('meals')
            .where('timestamp', '>=', start)
            .where('timestamp', '<=', end)
            .get(),
        userRef.collection('weights')
            .orderBy('date', 'desc')
            .limit(2)
            .get(),
        userRef.collection('stockItems').get(),
        userRef.collection('daily_evaluations')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get(),
        userRef.collection('lineMessages')
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
        messageHistory: mapSnapshotDocs(messagesSnap).reverse().map(message => ({
            role: message.role,
            text: message.text,
            createdAt: message.createdAt || null,
        })),
    };
};

const lineMessagesRef = (uid) => db.collection('users').doc(uid).collection('lineMessages');

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
