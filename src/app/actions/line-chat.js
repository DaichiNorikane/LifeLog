"use server";

import {
    apiKey,
    getGenAI,
    ELENA_PERSONA,
    MODELS_TO_TRY,
    THINKING,
    createModel,
} from "./gemini-client";

const ELENA_CHAT_FALLBACK = 'ごめんなさい、ちょっと考えがまとまりませんでした…😢 もう一度聞いてもらえますか？';

const formatNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
};

// null = 未取得（0と区別する。CLAUDE.md 栄養素データ構造を参照）
const formatNullable = (value, unit) => {
    if (value === null || value === undefined) return 'データなし';
    const number = Number(value);
    return Number.isFinite(number) ? `${Math.round(number)}${unit}` : 'データなし';
};

const formatMealList = (meals = []) => {
    if (!meals.length) return '記録なし';
    return meals.map(meal => {
        const macros = meal.macros || {};
        return `- ${meal.mealType || '食事'}: ${meal.foodName || '不明'} ${formatNumber(meal.calories)}kcal / P${formatNumber(macros.protein)} F${formatNumber(macros.fat)} C${formatNumber(macros.carbs)}`;
    }).join('\n');
};

const formatWeights = (weights = []) => {
    if (!weights.length) return '記録なし';
    return weights.map(weight => `- ${weight.date || '日付不明'}: ${weight.weight}kg`).join('\n');
};

const formatDailyEvaluation = (evaluation) => {
    if (!evaluation) return 'なし';
    return [
        `score: ${evaluation.score ?? '不明'}`,
        `title: ${evaluation.title || 'なし'}`,
        `advice: ${evaluation.advice || 'なし'}`,
    ].join('\n');
};

const formatMessageHistory = (messages = []) => {
    if (!messages.length) return '履歴なし';
    return messages.map(message => {
        const label = message.role === 'assistant' ? 'エレナ' : 'ユーザー';
        return `${label}: ${message.text}`;
    }).join('\n');
};

const buildElenaChatPrompt = (input = {}) => {
    const userText = String(input.userText || '').trim();
    const user = input.user || {};
    const today = input.today || {};
    const totalMacros = today.totalMacros || {};
    const targetCalories = formatNumber(user.targetCalories, 2000);
    const totalCalories = formatNumber(today.totalCalories, 0);
    const remainingCalories = Number.isFinite(Number(today.remainingCalories))
        ? formatNumber(today.remainingCalories)
        : targetCalories - totalCalories;
    const stockItems = input.stockItems || [];
    const stockText = stockItems.length
        ? stockItems.map(item => item.name || item).filter(Boolean).join(', ')
        : 'なし';

    return `
# Role
${ELENA_PERSONA}

あなたはLINEでユーザーの相談に答えます。返答はプレーンテキストのみ。最大300字程度、LINEで読みやすく改行してください。

【絶対ルール】
- 今日の実データの数字（残りカロリー、摂取カロリー、PFCなど）を必ず使い、一般論だけで終わらせない。
- 食材メモがある場合は、必ず少なくとも1つ具体名を使う。
- 口調はエレナ。絵文字多め、アメとムチ。甘やかすだけは禁止。
- 語尾は必ず丁寧語（です・ます調）にする。「〜だよ」「〜してね」「〜しよ！」のようなタメ口の語尾は禁止。絵文字・感嘆符・親しみやすさはそのまま。例: 「〜ですよ！」「〜してくださいね✨」「〜しましょう💪」
- 医療・症状の診断に踏み込む相談は、一般的な生活習慣アドバイスに留め、必要なら受診を促す。
- 記録の話になったら「写真か『◯◯食べた』で送ってくだされば記録しますよ」と誘導してよい。

【食事予定・気分への提案ルール】
直近の会話でエレナが食事の予定・体調・気分・食べたいものを尋ねていて、ユーザーが体調・気分・食べたいものを答えた場合は、(1)食べたい気持ちに共感し、(2)今日の残りカロリー・PFC・食材メモを踏まえ、(3)食べたいものをなるべく活かした現実的なメニューを2〜3個、量やカロリー目安付きで提案する。我慢一辺倒の提案はしない。食べたいものを健康的に食べる工夫を優先する。最後に「食べたら写真か一言で送ってくださいね」と記録へ誘導する。

【ユーザーの相談】
${userText}

【今日の実データ】
- 日付: ${today.dateId || '不明'}
- 目標カロリー: ${targetCalories} kcal
- 摂取カロリー: ${totalCalories} kcal
- 残りカロリー: ${remainingCalories} kcal
- PFC合計: P${formatNumber(totalMacros.protein)}g / F${formatNumber(totalMacros.fat)}g / C${formatNumber(totalMacros.carbs)}g
- 拡張栄養素: 食物繊維${formatNullable(totalMacros.fiber, 'g')} / 糖質${formatNullable(totalMacros.sugar, 'g')} / ナトリウム${formatNullable(totalMacros.sodium, 'mg')} / カリウム${formatNullable(totalMacros.potassium, 'mg')}

【今日の食事一覧】
${formatMealList(today.meals || [])}

【ユーザー目標】
- 現在体重: ${user.currentWeight ?? '未設定'} kg
- 目標体重: ${user.targetWeight ?? '未設定'} kg
- 目標日: ${user.targetDate || '未設定'}

【直近体重2件】
${formatWeights(input.recentWeights || [])}

【食材メモ】
${stockText}

【直近の日次評価】
${formatDailyEvaluation(input.latestDailyEvaluation)}

【直近の会話履歴（古い順）】
${formatMessageHistory(input.messageHistory || [])}
    `.trim();
};

export const generateElenaChatReply = async (input = {}) => {
    if (!apiKey) return ELENA_CHAT_FALLBACK;

    const genAI = getGenAI();
    const prompt = buildElenaChatPrompt(input);

    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = createModel(genAI, modelName, null, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const text = String(result.response.text() || '').trim();
            if (text) return text;
        } catch (e) {
            console.warn(`Line chat model ${modelName} failed:`, e.message);
        }
    }

    return ELENA_CHAT_FALLBACK;
};
