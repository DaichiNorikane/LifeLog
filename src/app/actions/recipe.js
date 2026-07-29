"use server";
import {
    apiKey, getGenAI, MODELS_TO_TRY, THINKING, createModel,
    RECIPE_HYBRID_SCHEMA, RECIPE_CALC_SCHEMA, RECIPE_SEARCH_SCHEMA
} from "./gemini-client";
import { EXTENDED_NUTRIENTS_INSTRUCTION } from "@/lib/health/nutrients";

export const calculateRecipeHybrid = async (ingredients) => {
    if (!apiKey) return { error: "API Key missing" };
    if (!ingredients || ingredients.length === 0) return { error: "No ingredients provided" };

    const genAI = getGenAI();

    let knownStats = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    let knownListStr = "";
    let unknownListStr = "";

    ingredients.forEach(item => {
        if (item.source === 'official' && item.nutrients && item.amount) {
            const ratio = item.amount / 100;
            const cals = (item.nutrients.calories || 0) * ratio;
            const p = (item.nutrients.protein || 0) * ratio;
            const f = (item.nutrients.fat || 0) * ratio;
            const c = (item.nutrients.carbs || 0) * ratio;

            knownStats.calories += cals;
            knownStats.protein += p;
            knownStats.fat += f;
            knownStats.carbs += c;

            knownListStr += `- ${item.name}: ${item.amount}g (約${Math.round(cals)}kcal)\n`;
        } else if (item.source === 'official' && item.nutrients && !item.amount) {
            unknownListStr += `- ${item.name} (分量不明) [参考値: 100gあたり ${item.nutrients.calories}kcal, P:${item.nutrients.protein}g, F:${item.nutrients.fat}g, C:${item.nutrients.carbs}g]\n`;
        } else {
            unknownListStr += `- ${item.name || item.text} ${item.amount ? item.amount + 'g' : ''}\n`;
        }
    });

    const prompt = `
あなたは栄養計算のプロです。以下の食材リストから、レシピ全体の料理名と栄養価を計算・推測してください。

【確定している食材 (成分計算済み)】
${knownListStr}
(確定分の合計: ${Math.round(knownStats.calories)}kcal, P:${knownStats.protein.toFixed(1)}g, F:${knownStats.fat.toFixed(1)}g, C:${knownStats.carbs.toFixed(1)}g)

【成分不明・推測が必要な食材】
${unknownListStr || "(なし)"}

【タスク】
1. 「成分不明」または「分量不明」の食材がある場合、料理の文脈から適切な分量を推測してください。
2. 分量不明だが「参考値」が提供されている食材については、推測した分量と参考値(100gあたり)を使って正確に計算してください。
3. 「確定分」と「推測分」を合計し、レシピ**全体**のカロリーとPFCを算出してください。
4. 食材の組み合わせから、最も可能性の高い「料理名」を推測してください。
5. このレシピ全体が「何人前」に相当するか推測してください。（例: 米300gと肉200gなら約2-3人前）
6. **1人前あたり**の数値を計算してください。

${EXTENDED_NUTRIENTS_INSTRUCTION}

reasoning には計算の根拠を記載してください。
    `.trim();

    let lastError = null;
    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`Calculating hybrid recipe with ${modelName}...`);
            const model = createModel(genAI, modelName, RECIPE_HYBRID_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            return JSON.parse(result.response.text());
        } catch (e) {
            console.warn(`Hybrid Calc failed on ${modelName}:`, e.message);
            lastError = e;
        }
    }

    return { error: `Calculation failed: ${lastError?.message}` };
};

export const calculateRecipeWithGemini = async (ingredients) => {
    if (!apiKey) return { error: "API Key missing" };
    const genAI = getGenAI();

    const prompt = `
あなたは栄養計算のプロです。以下の食材リストから、料理全体の栄養価を計算してください。

【食材リスト】
${ingredients}

【タスク】
1. リストの内容を解釈し、一般的な料理名を推測してください。
2. 提供された食材リスト全体が「何人前」に相当するか推定してください。（例: 豆腐300gとひき肉100gなら概ね2人前など）
3. **1人前あたり**のカロリーとPFCを計算してください。（全体の栄養価 ÷ 推定人数）

${EXTENDED_NUTRIENTS_INSTRUCTION}

reasoning には計算の根拠（例: 全体を2人前と推定。合計XXXkcal ÷ 2...）を記載してください。
    `.trim();

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`Calculating recipe with model: ${modelName}`);
            const model = createModel(genAI, modelName, RECIPE_CALC_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            return JSON.parse(result.response.text());
        } catch (e) {
            console.warn(`Recipe Calc Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: `All models failed. Last check: ${lastError?.message}` };
};

export const searchRecipesWithGemini = async (query, stockItems = []) => {
    const stockContext = stockItems.length > 0 ? `冷蔵庫・ストック: ${stockItems.map(i => i.name).join(', ')}` : "";

    const prompt = `
あなたはプロの栄養士兼シェフです。
ユーザーの要望「${query}」に基づき、美味しくて健康的なレシピを合計**6つ**考案してください。
${stockContext}

【重要な要件】
1. **提案の内訳**:
   - **3つ**: ストックにある食材（もしあれば）を**優先的に使う**レシピ。
   - **3つ**: ストックを**完全に無視して**、純粋に美味しさや目新しさを追求したレシピ。
2. **材料と分量を明確に**: カロリー計算の根拠となるため、全ての材料と分量（1人前）を具体的にリストアップしてください。
3. **正確な栄養価計算**: 提示した材料に基づいて、カロリーとPFCバランスを可能な限り正確に計算してください。
4. **手順**: 簡潔かつ分かりやすい手順を含めてください。
    `.trim();

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            if (!apiKey) throw new Error("API Key is missing.");
            const genAI = getGenAI();
            const model = createModel(genAI, modelName, RECIPE_SEARCH_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            return JSON.parse(result.response.text());
        } catch (error) {
            console.warn(`Recipe Search Model ${modelName} failed:`, error.message);
            lastError = error;
        }
    }

    throw lastError || new Error("Recipe search failed");
};
