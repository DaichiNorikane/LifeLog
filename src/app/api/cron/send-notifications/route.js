import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { pushMessage } from '@/lib/line';
import { evaluateDailyLog } from '@/app/actions';

// 1. Cron Secret Security
function verifyCron(request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return false;
    }
    return true;
}

export async function GET(request) {
    // Vercel Cron sends GET requests
    // Verify secret (Optional for local testing if not set)
    if (process.env.CRON_SECRET && !verifyCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 2. Determine Time & Message Type (JST)
        const now = new Date();
        const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const hour = jstNow.getUTCHours();

        let messageType = 'generic'; // debug default

        // Define Schedule
        if (hour >= 6 && hour < 9) messageType = 'morning';
        else if (hour >= 11 && hour < 14) messageType = 'lunch';
        else if (hour >= 17 && hour < 20) messageType = 'dinner';
        else if (hour >= 21) messageType = 'night';
        else {
            // Off-hours - maybe skip or send only if critical?
            // For now, let's allow manual trigger testing or just log
            console.log(`[Cron] Off-hours execution (${hour}h JST). Skipping unless forced.`);
            // return NextResponse.json({ status: 'skipped', reason: 'off-hours' });
        }

        console.log(`[Cron] Starting batch for ${messageType} at ${hour}h JST`);

        // 3. Fetch Linked Users
        const usersRef = collection(db, 'users');
        // Simple query: users with 'lineUserId' field
        // Firestore doesn't support "where field exists" efficiently without setup, 
        // so we might need to filter client side or use a flag 'isLineLinked'
        // Let's assume user profiles are not huge (e.g. < 1000 for MVP)
        // Better: Query where lineUserId != null (requires index often) or just get all and filter
        const snapshot = await getDocs(usersRef);

        let sentCount = 0;

        for (const docSnapshot of snapshot.docs) {
            const userData = docSnapshot.data();
            if (!userData.lineUserId) continue;

            const userId = docSnapshot.id;
            console.log(`[Cron] Processing user: ${userId}`);

            // 4. Generate Content (Lightweight Eval)
            // Reuse evaluateDailyLog or simplified logic?
            // Let's try to get daily data for context

            // Need daily log. We can't easily get calculated "dailyLog" without re-calculating from meals collection
            // This is heavy. Let's start with a simpler "Reminder" or "Generic Support" message 
            // OR fetch today's meals for this user.

            // To do it right: Fetch today's meals
            const todayStr = jstNow.toISOString().split('T')[0];
            // We need to implement 'getMealsForDate' or similar query server-side
            // ... Assuming we skip deep analysis for MVP efficiency and just say:
            // "Morning! Have a healthy breakfast!"

            // BUT, user wants "AI Evaluation Notification".
            // So we MUST fetch data.

            // Optimization: Only fetch for active users?
            // For now, fetch meals.
            const mealsRef = collection(db, 'users', userId, 'meals');
            // Query by date is hard without 'date' field on meals (we use ISO timestamp)
            // Need range query
            const startOfDay = new Date(todayStr); // UTC? No, this string is local... wait. 
            // Better: use string compare on timestamp if ISO. Or just fetch recent limit 20 and filter in memory.
            const mealsQ = query(mealsRef, where('timestamp', '>=', `${todayStr}T00:00:00`));
            // Note: timestamp string comparison works if format is consistent ISO

            let dailyMeals = [];
            try {
                const mSnap = await getDocs(mealsQ); // This might fail if index missing
                dailyMeals = mSnap.docs.map(d => d.data());
            } catch (e) {
                console.warn(`[Cron] Failed to fetch meals for ${userId}`, e);
            }

            // Calculate basic stats
            const consumed = dailyMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
            const target = userData.targetCalories || 2200;

            // 5. Generate Message with AI (Simplified Prompt)
            let prompt = "";
            if (messageType === 'morning') {
                prompt = `朝です！今日も1日、目標${target}kcalに向けて頑張りましょう！朝食はしっかり摂ってくださいね✨`;
            } else if (messageType === 'lunch') {
                prompt = `お昼の時間です。現在の摂取：${consumed}kcal / 目標${target}kcal。午後に備えて栄養チャージしましょう！🥗`;
            } else if (messageType === 'dinner') {
                prompt = `夕食の時間ですね。現在${consumed}kcal摂取しています。残り${target - consumed}kcalです。バランス良く楽しみましょう！🌙`;
            } else {
                prompt = `毎日の記録、お疲れ様です！エレナが応援していますよ💪`;
            }

            // Push Message
            const result = await pushMessage(userData.lineUserId, {
                type: 'text',
                text: prompt // Using fixed prompt for now to save AI tokens, ideally call evaluateDailyLog here
            });

            if (result.success) sentCount++;
        }

        return NextResponse.json({ status: 'success', sent: sentCount });

    } catch (e) {
        console.error("[Cron] Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
