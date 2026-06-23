"use server";
import {
    apiKey, getGenAI, MODELS_TO_TRY, THINKING, createModel, FOOD_ANALYSIS_SCHEMA
} from "./gemini-client";

export const analyzeImageWithGemini = async (base64Image, context = "") => {
    if (!apiKey) {
        console.warn("No API Key found");
        return { error: "API Key missing" };
    }

    const genAI = getGenAI();
    const base64Data = base64Image.split(',')[1];
    const imagePart = {
        inlineData: {
            data: base64Data,
            mimeType: "image/jpeg",
        },
    };

    const prompt = `
あなたは世界最高峰の栄養管理AIです。以下の食事画像を詳しく分析し、料理名・カロリー・栄養素を特定してください。

【ユーザーからの補足情報】
${context
    ? `ユーザーは写真についてこう述べています: "「${context}」"

**重要: ユーザーの補足情報を画像情報よりも優先してください。**
例えば「半分食べた」とあれば、画像で満杯に見えても**必ずカロリーを50%に減らして**計算してください。「ご飯なし」とあれば、画像にご飯が写っていても**炭水化物を除外**してください。`
    : "特になし。"}

分析手順：
1. 画像に写っている料理を特定する
2. ユーザーの補足情報があれば、それを最優先で反映させる（分量変更など）
3. 一般的な提供量・調理法から栄養価を推定する

reasoning には分析の根拠とユーザーの補足情報の反映について日本語で説明してください。
    `.trim();

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`Attempting analysis with model: ${modelName}`);
            const model = createModel(genAI, modelName, FOOD_ANALYSIS_SCHEMA, THINKING.DYNAMIC);

            const result = await model.generateContent([prompt, imagePart]);
            const data = JSON.parse(result.response.text());
            data.reasoning = `[Model: ${modelName}] ${data.reasoning}`;
            return data;

        } catch (e) {
            console.warn(`Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: `All models failed. Last error: ${lastError?.message}` };
};
