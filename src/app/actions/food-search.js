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

    // 複数食材の同時検索に対応: 配列で渡された場合はそれぞれ別建てで候補生成
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

      出力形式 (JSONのみ):
      {
        "suggestions": [
          {
            "forQuery": "該当する検索語（上記リストと完全一致）",
            "foodName": "正確な商品名/料理名",
            "calories": 数値 (kcal),
            "macros": { "protein": 数値(g), "fat": 数値(g), "carbs": 数値(g) },
            "reasoning": "選出理由"
          }
        ]
      }
    ` : `
      あなたは厳格な栄養データベースです。ユーザーが「${queries[0]}」と検索しました。
      実在する、関連性の高い食事候補を10個提案してください。

      【パーソナライズ考慮】
      ユーザーの過去の食事履歴: ${historyContext}
      - もし履歴の中に、検索語句「${queries[0]}」と一致または非常に近いものがあれば、それを優先的に上位に提案してください。

      【重要: ハルシネーション（嘘の生成）を禁止します】
      - 「${queries[0]}」そのものが存在しない・曖昧な場合は、推測で捏造せず、一般的な近い料理や、「該当なし」と判断できる候補を出してください。
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
    let succeeded = false;

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
                succeeded = true;
                break;
            }
        } catch (e) {
            console.warn(`Search Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    if (!succeeded) {
        return { error: lastError?.message || "全モデルでAI検索に失敗しました", suggestions: [] };
    }

    return { suggestions: aiSuggestions };
};

export const searchFoodWithGemini = searchAiFood;
