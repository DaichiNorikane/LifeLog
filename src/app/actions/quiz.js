"use server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { apiKey, ELENA_PERSONA } from "./gemini-client";

// ========== Elena's Challenge (Quiz Generation) ==========
export const generateQuizWithGemini = async (count = 5) => {
    if (!apiKey) {
        return { error: "API Key missing" };
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const themes = [
        "ビタミン・ミネラルの役割", "三大栄養素（PFC）", "カロリーの基礎知識", "水分補給の重要性",
        "睡眠とダイエットの関係", "GI値と血糖値", "筋肉と代謝", "有酸素運動と無酸素運動",
        "食物繊維の働き", "加工食品と添加物", "夜遅くの食事", "朝食の重要性", "ストレスと食欲",
        "リバウンドの仕組み", "健康的な間食", "アルコールとダイエット", "むくみの原因", "便秘解消",
        "基礎代謝を上げる方法", "体脂肪の種類"
    ];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];

    const prompt = `
      ${ELENA_PERSONA}
      ユーザーにダイエットや栄養に関する知識を深めてもらうため、4択クイズを作成してください。

      【今回のテーマ】
      "${randomTheme}" に関連する問題を重点的に作成してください（ただしこれ以外も少し混ぜてOK）。

      【要件】
      - 作成数: ${count}問
      - 難易度: 初級〜中級（一般人が「へぇ〜」と思うような豆知識を含む）
      - キャラクター: エレナ（知的で論理的だが、少しお茶目で厳しい一面もある）
      - 解説: 正解・不正解にかかわらず、ユーザーが納得できる短い解説（エレナの口調で「〜ですね」「〜ですよ」）。

      出力形式 (JSON配列のみ):
      [
        {
          "question": "問題文（50文字以内）",
          "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
          "correctIndex": 正解のインデックス(0-3の数値),
          "explanation": "解説文（100文字以内。エレナの口調で）"
        },
        ...
      ]
    `;

    const MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
    let lastError = null;

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const quizzes = JSON.parse(jsonMatch[0]);
                if (Array.isArray(quizzes)) {
                    return quizzes;
                }
            }
            throw new Error("Failed to parse JSON Array");

        } catch (e) {
            console.warn(`Quiz Gen Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: "Failed to generate quizzes", details: lastError?.message };
};
