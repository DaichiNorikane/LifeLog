import webpush from 'web-push';
import { db } from '@/lib/firebase/admin';

let vapidConfigured = false;

function ensureVapid() {
    if (vapidConfigured) return true;
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
            'mailto:noreply@lifelog.app',
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
        vapidConfigured = true;
        return true;
    }
    return false;
}

/**
 * Send a Web Push notification to a user.
 * Automatically cleans up expired subscriptions.
 */
export async function sendPushToUser(userId, subscription, { title, body, tag, url }) {
    if (!subscription || !ensureVapid()) return false;

    try {
        const payload = JSON.stringify({
            title: title || 'LifeLog',
            body: (body || '').slice(0, 200),
            tag: tag || 'lifelog-notification',
            url: url || '/',
        });
        await webpush.sendNotification(subscription, payload);
        return true;
    } catch (err) {
        console.error(`[Push] Failed for ${userId}:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
            const { FieldValue } = await import('firebase-admin/firestore');
            await db.collection('users').doc(userId).update({
                pushSubscription: FieldValue.delete(),
            }).catch(() => {});
        }
        return false;
    }
}

/**
 * Get JST date helpers
 */
export function getJSTToday() {
    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const todayStr = jstNow.toISOString().split('T')[0];
    return { jstNow, todayStr };
}

const DAILY_NOTIFICATION_LIMIT = 4;

/**
 * Check if we can send another notification today (max 4/day per user).
 */
export async function canSendNotification(userId, todayStr) {
    const doc = await db.collection('users').doc(userId)
        .collection('notification_logs').doc(todayStr).get();
    if (!doc.exists) return true;
    return (doc.data().count || 0) < DAILY_NOTIFICATION_LIMIT;
}

/**
 * Record that a notification was sent.
 */
export async function recordNotification(userId, todayStr, type) {
    const { FieldValue } = await import('firebase-admin/firestore');
    const ref = db.collection('users').doc(userId)
        .collection('notification_logs').doc(todayStr);
    const doc = await ref.get();
    if (doc.exists) {
        await ref.update({
            count: FieldValue.increment(1),
            types: FieldValue.arrayUnion(type),
            lastSentAt: new Date().toISOString(),
        });
    } else {
        await ref.set({
            count: 1,
            types: [type],
            lastSentAt: new Date().toISOString(),
        });
    }
}

/**
 * Send push with rate limiting. Returns true if sent.
 */
export async function sendPushWithLimit(userId, subscription, todayStr, type, payload) {
    if (!await canSendNotification(userId, todayStr)) return false;
    const success = await sendPushToUser(userId, subscription, payload);
    if (success) await recordNotification(userId, todayStr, type);
    return success;
}

/**
 * Get or run daily AI evaluation for a user.
 * Returns cached evaluation if it exists and is recent enough, otherwise runs a new one.
 * @param {string} userId
 * @param {string} todayStr - YYYY-MM-DD
 * @param {Array} meals - Today's meals (if already fetched, pass them to avoid re-fetch)
 * @param {Object} userData - User profile data (targetCalories, etc.)
 * @returns {Object|null} Evaluation result or null if no meals/error
 */
export async function getOrRunEvaluation(userId, todayStr, meals = null, userData = {}) {
    const { evaluateDailyLog } = await import('@/app/actions/daily-evaluation');
    const dateKey = todayStr.replace(/-/g, '');

    // Check for existing evaluation
    const evalDoc = await db.collection('users').doc(userId)
        .collection('daily_evaluations').doc(dateKey).get();

    if (evalDoc.exists) {
        const existing = evalDoc.data();
        // Use cached if it was created within the last 2 hours
        const createdAt = existing.createdAt ? new Date(existing.createdAt) : null;
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        if (createdAt && createdAt > twoHoursAgo) {
            return existing;
        }
    }

    // Fetch meals if not provided
    if (!meals) {
        meals = await getTodayMeals(userId, todayStr);
    }
    if (meals.length === 0) return null;

    const consumedCalories = meals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);
    const target = userData.targetCalories || 2000;

    try {
        // 睡眠・集中力などの生活データ（取れなければ null で従来通りの食事評価になる）
        const { buildTrainerContextTextAdmin } = await import('@/lib/firebase/adminHelpers');
        const trainerContext = await buildTrainerContextTextAdmin(userId, userData);

        const evaluation = await evaluateDailyLog({
            date: todayStr,
            consumedCalories,
            targetCalories: target,
            meals,
            currentWeight: userData.currentWeight,
            targetWeight: userData.targetWeight,
            targetDate: userData.targetDate,
            trainerContext,
        });

        if (evaluation && !evaluation.error) {
            await db.collection('users').doc(userId)
                .collection('daily_evaluations').doc(dateKey).set({
                    ...evaluation,
                    createdAt: new Date().toISOString(),
                });
            return evaluation;
        }
    } catch (e) {
        console.error(`[Eval] Failed for ${userId}:`, e.message);
    }
    return null;
}

/**
 * Get today's meals for a user within JST day boundaries.
 */
export async function getTodayMeals(userId, todayStr) {
    const startJST = new Date(`${todayStr}T00:00:00+09:00`);
    const endJST = new Date(`${todayStr}T23:59:59+09:00`);
    const snapshot = await db.collection('users').doc(userId).collection('meals')
        .where('timestamp', '>=', startJST.toISOString())
        .where('timestamp', '<=', endJST.toISOString())
        .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}
