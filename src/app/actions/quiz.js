"use server";
import {
    apiKey, getGenAI, ELENA_PERSONA, MODELS_TO_TRY, THINKING, createModel, QUIZ_SCHEMA
} from "./gemini-client";

export const generateQuizWithGemini = async (count = 5) => {
    if (!apiKey) {
        return { error: "API Key missing" };
    }

    const genAI = getGenAI();

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
- question は50文字以内、explanation は100文字以内にしてください。
    `.trim();

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = createModel(genAI, modelName, QUIZ_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const quizzes = JSON.parse(result.response.text());
            if (Array.isArray(quizzes)) {
                return quizzes;
            }
            throw new Error("Response is not an array");
        } catch (e) {
            console.warn(`Quiz Gen Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: "Failed to generate quizzes", details: lastError?.message };
};
