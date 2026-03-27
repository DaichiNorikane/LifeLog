"use server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { apiKey, MODELS_TO_TRY } from "./gemini-client";

/**
 * Server Action: Search using Gemini AI.
 * Used for fallback or complex queries.
 */
export const searchAiFood = async (query, historyContext = "") => {
    if (!apiKey) {
        return { error: "API Key missing" };
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `
      あなたは厳格な栄養データベースです。ユーザーが「${query}」と検索しました。
      実在する、関連性の高い食事候補を10個提案してください。

      【パーソナライズ考慮】
      ユーザーの過去の食事履歴: ${historyContext}
      - もし履歴の中に、検索語句「${query}」と一致または非常に近いものがあれば、それを優先的に上位に提案してください。

      【重要: ハルシネーション（嘘の生成）を禁止します】
      - 「${query}」そのものが存在しない・曖昧な場合は、推測で捏造せず、一般的な近い料理や、「該当なし」と判断できる候補を出してください。
      - お店のメニュー名が含まれる場合、公式情報を優先してください。

      出力形式 (JSONのみ):
      {
        "suggestions": [
          {
            "foodName": "正確な商品名/料理名",
            "calories": 数値 (kcal),
            "macros": { "protein": 数値(g), "fat": 数値(g), "carbs": 数値(g) },
            "reasoning": "選出理由"
          }
        ]
      }
    `;

    let aiSuggestions = [];
    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const jsonMatch = text.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                if (data.suggestions) {
                    aiSuggestions = data.suggestions.map(s => ({
                        ...s,
                        reasoning: `[AI: ${modelName}] ${s.reasoning}`
                    }));
                }
                break;
            }
        } catch (e) {
            console.warn(`Search Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return {
        suggestions: aiSuggestions
    };
};

export const searchFoodWithGemini = searchAiFood;
