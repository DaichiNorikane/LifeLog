import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getJstDateId, saveLineAssistantMessageAdmin } from '@/lib/firebase/adminHelpers';
import { pushMessage } from '@/lib/line/client';

export const MEAL_NUDGE_TYPES = ['breakfast', 'lunch', 'dinner'];

const MEAL_NUDGE_TEXT = {
    breakfast: 'おはよ☀️ 朝ごはんの記録がまだみたい！もう食べた？\n食べてたら写真か「◯◯食べた」で送ってね📷\nこれからなら、今の体調と気分、食べたいものを教えて！あなたに合う朝メニュー考えるから🍽✨',
    lunch: 'お昼だよ🍱 昼食の記録がまだみたい！もう食べた？\n食べてたら写真か「◯◯食べた」で送ってね📷\nこれからなら、今の体調と気分、食べたいものを教えて！午後も動けるメニュー考えるよ✨',
    dinner: '夜ごはんの記録がまだみたい🌙 もう食べた？\n食べてたら写真か「◯◯食べた」で送ってね📷\nこれからなら、今の体調と気分、食べたいものを教えて！目標と満足感のバランス取るから🍽✨',
};

const isValidMeal = (meal) => MEAL_NUDGE_TYPES.includes(meal);

const getMealFromRequest = (request) => {
    try {
        return new URL(request.url).searchParams.get('meal');
    } catch {
        return null;
    }
};

const getJstDayRange = (date = new Date()) => {
    const dateId = getJstDateId(date);
    return {
        start: new Date(`${dateId}T00:00:00+09:00`).toISOString(),
        end: new Date(`${dateId}T23:59:59+09:00`).toISOString(),
    };
};

const userHasMealTypeToday = async (uid, mealType) => {
    const { start, end } = getJstDayRange();
    const snapshot = await db.collection('users').doc(uid).collection('meals')
        .where('timestamp', '>=', start)
        .where('timestamp', '<=', end)
        .get();
    return (snapshot.docs || []).some(doc => doc.data()?.mealType === mealType);
};

export const handleMealNudgeRequest = async (request, mealOverride = null) => {
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const meal = mealOverride || getMealFromRequest(request);
    if (!isValidMeal(meal)) {
        return NextResponse.json({ error: 'Invalid meal' }, { status: 400 });
    }

    try {
        const usersSnapshot = await db.collection('users').get();
        let nudged = 0;
        let skipped = 0;
        const text = MEAL_NUDGE_TEXT[meal];

        for (const userDoc of usersSnapshot.docs || []) {
            const uid = userDoc.id;
            const userData = userDoc.data() || {};
            const lineUserId = userData.lineUserId;

            if (!lineUserId) {
                skipped += 1;
                continue;
            }

            if (await userHasMealTypeToday(uid, meal)) {
                skipped += 1;
                continue;
            }

            try {
                const result = await pushMessage(lineUserId, { type: 'text', text });
                if (result?.success) {
                    nudged += 1;
                    await saveLineAssistantMessageAdmin(uid, text);
                }
            } catch (e) {
                console.warn(`[Cron] meal-nudge push failed for ${uid}:`, e.message);
            }
        }

        return NextResponse.json({ success: true, meal, nudged, skipped });
    } catch (error) {
        console.error('[Cron] meal-nudge failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
};

export async function GET(request) {
    return handleMealNudgeRequest(request);
}
