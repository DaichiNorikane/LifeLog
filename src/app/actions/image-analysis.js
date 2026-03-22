"use server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { apiKey, MODELS_TO_TRY } from "./gemini-client";

export const analyzeImageWithGemini = async (base64Image, context = "") => {
    if (!apiKey) {
        console.warn("No API Key found");
        return { error: "API Key missing" };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const base64Data = base64Image.split(',')[1];
    const imagePart = {
        inlineData: {
            data: base64Data,
            mimeType: "image/jpeg",
        },
    };

    const prompt = `
          あなたは世界最高峰の栄養管理AIです。
          「Gemini 3 Thinking Mode」として、以下の画像を深く、論理的に分析してください。

          【ユーザーからの補足情報】
          ${context ? `ユーザーは写真についてこう述べています: "「${context}」"\n\n**重要: ユーザーの補足情報を画像情報よりも優先してください。**\n例えば「半分食べた」とあれば、画像で満杯に見えても**必ずカロリーを50%に減らして**計算してください。「ご飯なし」とあれば、画像にご飯が写っていても**炭水化物を除外**してください。` : "特になし。"}

          まず、<thinking>タグの中で、詳細な思考プロセスを展開してください。
          - 料理の特定
          - コンテキストの反映（ユーザー補足がある場合、計算式を明示すること）
          - 量の推定

          その後、以下のJSON形式で結果を出力してください。

          {
            "foodName": "料理名",
            "calories": 数値,
            "macros": { "protein": 数値, "fat": 数値, "carbs": 数値 },
            "breakdown": ["食材A", "食材B"],
            "reasoning": "ユーザーに表示する、あなたの分析結果の要約（日本語）。補足情報の反映についても触れてください。"
          }
        `;

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`Attempting analysis with model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const text = response.text();

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                data.reasoning = `[Model: ${modelName}] ${data.reasoning}`;
                return data;
            } else {
                throw new Error("Failed to parse JSON");
            }

        } catch (e) {
            console.warn(`Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: `All models failed. Last error: ${lastError?.message}` };
};
