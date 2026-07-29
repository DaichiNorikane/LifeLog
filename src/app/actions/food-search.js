"use server";
import {
    apiKey, getGenAI, MODELS_TO_TRY, THINKING, createModel, FOOD_SEARCH_SCHEMA, FOOD_ANALYSIS_SCHEMA
} from "./gemini-client";
import { EXTENDED_NUTRIENTS_INSTRUCTION } from "@/lib/health/nutrients";

export const searchAiFood = async (query, historyContext = "") => {
    if (!apiKey) {
        return { error: "API Key missing" };
    }

    const genAI = getGenAI();

    const queries = Array.isArray(query)
        ? query.map(q => String(q || '').trim()).filter(Boolean)
        : [String(query || '').trim()].filter(Boolean);

    if (queries.length === 0) {
        return { error: "検索語が空です", suggestions: [] };
    }

    const isMulti = queries.length > 1;
    const queryListText = queries.map((q, i) => `  ${i + 1}. 「${q}」`).join('\n');

    const prompt = isMulti ? `
あなたは厳格な栄養データベースです。ユーザーが以下の複数の食事を一度に検索しました。
${queryListText}

それぞれの食材・料理ごとに、実在する関連性の高い候補を5個ずつ提案してください。
各候補には、どの検索語に対する候補かを示す "forQuery" フィールドを必ず含めてください。

【パーソナライズ考慮】
ユーザーの過去の食事履歴: ${historyContext}
- 履歴に一致または近いものがあれば優先的に上位に出してください。

【重要: ハルシネーション禁止】
- 存在しない・曖昧な検索語は推測で捏造せず、近い料理を出すか件数を減らしてください。
- 店舗メニューは公式情報を優先。
${EXTENDED_NUTRIENTS_INSTRUCTION}
    `.trim() : `
あなたは厳格な栄養データベースです。ユーザーが「${queries[0]}」と検索しました。
実在する、関連性の高い食事候補を10個提案してください。

【パーソナライズ考慮】
ユーザーの過去の食事履歴: ${historyContext}
- 履歴の中に「${queries[0]}」と一致または非常に近いものがあれば、優先的に上位に提案してください。

【重要: ハルシネーション禁止】
- 「${queries[0]}」そのものが存在しない・曖昧な場合は、推測で捏造せず、近い料理を出してください。
- お店のメニューが含まれる場合、公式情報を優先してください。
${EXTENDED_NUTRIENTS_INSTRUCTION}
    `.trim();

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = createModel(genAI, modelName, FOOD_SEARCH_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const data = JSON.parse(result.response.text());
            const suggestions = (data.suggestions || []).map(s => ({
                ...s,
                reasoning: `[AI: ${modelName}] ${s.reasoning}`
            }));
            return { suggestions };
        } catch (e) {
            console.warn(`Search Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: lastError?.message || "全モデルでAI検索に失敗しました", suggestions: [] };
};

export const searchFoodWithGemini = searchAiFood;

export const estimateMealFromText = async (description, context = "") => {
    if (!apiKey) {
        return { error: "API Key missing" };
    }

    const mealDescription = String(description || '').trim();
    const correctionContext = String(context || '').trim();
    if (!mealDescription) {
        return { error: "食事内容が空です" };
    }

    const genAI = getGenAI();
    const prompt = `
あなたは厳格な栄養推定AIです。LINEで送られた食事テキストから、1食ぶんの料理名・カロリー・栄養素を推定してください。

【食事内容】
${mealDescription}

【修正・補足】
${correctionContext || "特になし"}

【重要】
- 複数品目が含まれていても、1食として合算してください。
- 料理名 foodName は、合算内容が伝わる短い名前にしてください。
- 補足がある場合は必ず優先してください（例: ご飯半分、ドレッシングなし、プロテイン追加）。

${EXTENDED_NUTRIENTS_INSTRUCTION}
    `.trim();

    let lastError = null;
    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = createModel(genAI, modelName, FOOD_ANALYSIS_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const data = JSON.parse(result.response.text());
            data.reasoning = `[AI: ${modelName}] ${data.reasoning || ''}`.trim();
            return data;
        } catch (e) {
            console.warn(`Text meal estimate model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: lastError?.message || "全モデルで食事推定に失敗しました" };
};
