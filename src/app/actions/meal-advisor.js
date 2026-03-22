"use server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { apiKey, ELENA_PERSONA, MODELS_TO_TRY, extractJSON } from "./gemini-client";

export const suggestNextMeal = async (history, dailyLog, targetType = 'auto', stockItems = []) => {
    const labels = {
        breakfast: '朝食',
        lunch: '昼食',
        dinner: '夕食',
        snack: '間食・おやつ',
        skip: '食事を控える',
        auto: '次の食事'
    };

    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const hour = jstNow.getUTCHours();

    const todayMeals = history;
    const eatenMealTypes = todayMeals.map(m => m.mealType).filter(Boolean);
    const hasBreakfast = eatenMealTypes.includes('breakfast');
    const hasLunch = eatenMealTypes.includes('lunch');
    const hasDinner = eatenMealTypes.includes('dinner');

    console.log('[suggestNextMeal] Debug:', {
        hour,
        historyLength: history.length,
        todayMealsLength: todayMeals.length,
        eatenMealTypes,
        hasBreakfast,
        hasLunch,
        hasDinner,
        mealTypes: history.map(m => ({ food: m.foodName, type: m.mealType }))
    });

    const isBreakfastSkipped = hour >= 12 && !hasBreakfast;
    const isLunchSkipped = hour >= 17 && !hasLunch;
    const isDinnerSkipped = hour >= 22 && !hasDinner;

    const remainingCalories = Math.floor(dailyLog.targetCalories - dailyLog.totalCalories);
    const isOverCalories = remainingCalories < 0;
    const isLowCalories = remainingCalories > 300;

    let suggestedMealType = targetType;
    let mealContext = '';

    if (targetType === 'auto' || targetType === 'dinner') {
        if (hasLunch && !hasDinner && !isDinnerSkipped) {
            suggestedMealType = isOverCalories ? 'skip' : 'dinner';
            mealContext = isOverCalories ? '昼食は済んでいますが、既にカロリーオーバーです。' : '昼食は済んでいます。夕食を提案します。';
        } else if (hasBreakfast && !hasLunch && !isLunchSkipped) {
            suggestedMealType = 'lunch';
            mealContext = '朝食は済んでいます。昼食を提案します。';
        } else if (hasDinner || (hasLunch && hasDinner)) {
            if (isLowCalories) {
                suggestedMealType = 'dinner';
                mealContext = '夕食は済んでいますが、1日のカロリーが大幅に不足しています。追加で何か食べることを提案します。';
            } else {
                suggestedMealType = 'skip';
                mealContext = '今日の食事は全て済んでいます。これ以上の食事は控えましょう。';
            }
        } else if (isLunchSkipped && !hasDinner && !isDinnerSkipped) {
            suggestedMealType = isOverCalories ? 'skip' : 'dinner';
            mealContext = '昼食の時間は過ぎました。夕食を提案します。';
        } else if (isBreakfastSkipped && !hasLunch && !isLunchSkipped) {
            suggestedMealType = 'lunch';
            mealContext = '朝食の時間は過ぎました。昼食を提案します。';
        } else if (hour < 10 && !hasBreakfast) {
            suggestedMealType = 'breakfast';
            mealContext = '朝の時間帯です。朝食を提案します。';
        } else if (hour >= 10 && hour < 12 && !hasBreakfast) {
            suggestedMealType = 'breakfast';
            mealContext = '遅めの朝食の時間です。';
        } else if (hour >= 17 && !hasDinner && !isDinnerSkipped) {
            suggestedMealType = isOverCalories ? 'skip' : 'dinner';
            mealContext = isOverCalories ? '夕食時ですが、既にカロリーオーバーです。' : '夕食の時間帯です。';
        } else if (hour >= 22) {
            suggestedMealType = 'skip';
            mealContext = '夜遅い時間です。これ以上の食事は控えるべきです。';
        } else {
            suggestedMealType = 'snack';
            mealContext = '次の食事までの間食を提案します。';
        }
    }

    const mealCategory = labels[suggestedMealType] || '食事';
    const stockContext = stockItems.length > 0 ? `冷蔵庫・ストック・文脈情報: ${stockItems.map(i => i.name).join(', ')}` : "特になし";

    const prompt = `
        # Role
        ${ELENA_PERSONA}

        【文脈】
        ${mealContext}
        ${stockContext}
        カロリー状況: ${isOverCalories ? `目標より${Math.abs(remainingCalories)}kcal超過` : `残り${remainingCalories}kcal`}

        【提案のルール】
        1. **提案数**: **必ず4〜6個**のバリエーション豊かなメニューを提案してください。
        2. **アメとムチ**:
           - カロリー超過時: 「えっ...これ以上食べちゃダメです！🙅‍♀️」「お水だけにしておきましょう？🥺」と感情に訴える。
           - カロリー不足時（大きく不足している場合）: 「あと${remainingCalories}kcalも食べられますよ！」「しっかり食べないと筋肉落ちちゃいます💦」と、**具体的な残り数値を必ず言及して**食べることを推奨する。
           - 余裕がある時: 「今日は余裕ですね！美味しいもの食べちゃいましょう✨」と明るく。
        4. **提案内容**:
           - **ストック情報の活用**: 「${stockContext}」にある食材を使えるレシピを優先的に1〜2個含めること。
           - "reason"も会話調で。「これなら脂質も抑えられて最高ですよ！👍」など。

        出力はJSON形式のみ:
        {
            "mealCategory": "${mealCategory}",
            "detectedContext": "${mealContext}",
            "suggestions": [
                { "name": "メニュー名", "reason": "エレナとしての推奨理由（会話調・絵文字付き）", "calories": 推定kcal },
                ...
            ],
            "advice": "エレナからの全体アドバイス（1文・絵文字付き）"
        }
        `;

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            if (!apiKey) throw new Error("API Key is missing.");
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().replace(/```json\n?|\n?```/g, "").trim();
            const jsonMatch = text.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                parsed.debug = {
                    hour,
                    historyLength: history.length,
                    eatenMealTypes,
                    hasBreakfast,
                    hasLunch,
                    hasDinner,
                    suggestedMealType,
                    mealContext
                };
                return parsed;
            }
        } catch (error) {
            console.warn(`Suggestion Model ${modelName} failed:`, error.message);
            lastError = error;
        }
    }

    return {
        suggestions: [],
        advice: `現在AIアドバイスを利用できません。(理由: ${lastError?.message || "All models failed"})`,
        debug: {
            hour,
            historyLength: history.length,
            eatenMealTypes,
            hasBreakfast,
            hasLunch,
            hasDinner
        }
    };
};
