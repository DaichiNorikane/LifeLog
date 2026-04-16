import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getJSTToday, getTodayMeals } from '@/lib/pushHelper';

export async function GET(request) {
    const token = request.headers.get('x-widget-token');
    if (!token || token !== process.env.WIDGET_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = request.nextUrl.searchParams.get('uid');
    if (!userId) {
        return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    try {
        const { todayStr } = getJSTToday();

        const [meals, userDoc] = await Promise.all([
            getTodayMeals(userId, todayStr),
            db.collection('users').doc(userId).get(),
        ]);

        const userData = userDoc.exists ? userDoc.data() : {};
        const targetCalories = userData.targetCalories || 2000;

        const totals = meals.reduce(
            (acc, meal) => {
                const c = Number(meal.calories);
                const p = Number(meal.macros?.protein);
                const f = Number(meal.macros?.fat);
                const cb = Number(meal.macros?.carbs);
                return {
                    calories: acc.calories + (isNaN(c) ? 0 : c),
                    protein: acc.protein + (isNaN(p) ? 0 : p),
                    fat: acc.fat + (isNaN(f) ? 0 : f),
                    carbs: acc.carbs + (isNaN(cb) ? 0 : cb),
                };
            },
            { calories: 0, protein: 0, fat: 0, carbs: 0 }
        );

        const remaining = targetCalories - totals.calories;
        const ratio = targetCalories > 0 ? totals.calories / targetCalories : 0;

        // エレナの表情をスコアに応じて決定
        let elenaStatus;
        if (ratio <= 0) elenaStatus = 'waiting';
        else if (ratio < 0.5) elenaStatus = 'encourage';
        else if (ratio < 0.8) elenaStatus = 'normal';
        else if (ratio <= 1.05) elenaStatus = 'cheer';
        else if (ratio <= 1.2) elenaStatus = 'logic';
        else elenaStatus = 'scold';

        return NextResponse.json({
            date: todayStr,
            calories: Math.round(totals.calories),
            target: targetCalories,
            remaining: Math.round(remaining),
            ratio: Math.round(ratio * 100),
            protein: Math.round(totals.protein),
            fat: Math.round(totals.fat),
            carbs: Math.round(totals.carbs),
            mealCount: meals.length,
            elenaStatus,
        });
    } catch (error) {
        console.error('[Widget] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
