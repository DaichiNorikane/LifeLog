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
