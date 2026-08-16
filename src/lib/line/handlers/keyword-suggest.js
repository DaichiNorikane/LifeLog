import { db } from '@/lib/firebase/admin';
import { suggestNextMeal } from '@/app/actions/meal-advisor';
import { replyOrPushMessage } from '@/lib/line/client';
import { resolveUserOrReply } from '@/lib/line/resolveUser';
import { formatElenaText } from '@/lib/line/textFormat';

export const MEAL_KEYWORDS = {
    '朝食': 'breakfast',
    '昼食': 'lunch',
    '夕食': 'dinner',
};

const getTodayJstRange = (date = new Date()) => {
    const jstNow = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const todayStr = jstNow.toISOString().split('T')[0];
    return {
        start: new Date(`${todayStr}T00:00:00+09:00`).toISOString(),
        end: new Date(`${todayStr}T23:59:59+09:00`).toISOString(),
    };
};

export const handleKeywordSuggestEvent = async (event, targetType = MEAL_KEYWORDS[event.message?.text?.trim()]) => {
    const user = await resolveUserOrReply(event);
    if (!user) return;

    const { start, end } = getTodayJstRange();

    try {
        const [mealsSnap, stockSnap] = await Promise.all([
            db.collection('users').doc(user.uid).collection('meals')
                .where('timestamp', '>=', start)
                .where('timestamp', '<=', end)
                .get(),
            db.collection('users').doc(user.uid).collection('stockItems').get(),
        ]);

        const meals = mealsSnap.docs.map(d => d.data());
        const stockItems = stockSnap.docs.map(d => ({ name: d.data().name }));
        const consumedCalories = meals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);
        const dailyLog = {
            totalCalories: consumedCalories,
            targetCalories: user.data.targetCalories || 2200,
        };

        const result = await suggestNextMeal(meals, dailyLog, targetType, stockItems);
        const topSuggestions = (result.suggestions || []).slice(0, 3);
        const suggestionText = topSuggestions.length
            ? topSuggestions.map(s => `・${s.name}\n  (${s.reason})`).join('\n')
            : '（すみません、良いメニューが思いつきませんでした...💦）';

        await replyOrPushMessage(event, {
            type: 'text',
            text: `${formatElenaText(result.advice)}\n\n【おすすめメニュー】\n${suggestionText}`,
        });
    } catch (e) {
        console.error("Suggestion Error:", e);
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめんなさい、うまく考えられませんでした...😢\n少し時間を置いてから、もう一度試してみてください。',
        });
    }
};
