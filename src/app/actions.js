"use server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

// Models to try in order of preference
const MODELS_TO_TRY = [
    "gemini-3-flash-preview",
    "gemini-2.0-flash-exp",   // Added 2.0 Flash Experimental as high-quality backup
    "gemini-1.5-pro",         // High reasoning backup
    "gemini-flash-latest"     // Fast fallback
];

export const analyzeImageWithGemini = async (base64Image) => {
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
      
      まず、<thinking>タグの中で、詳細な思考プロセスを展開してください。
      - 料理の特定（特徴、彩り、調理法）
      - 量の推定（皿のサイズ、比較対象、盛り付けの高さ）
      - コンテキスト読解（1人分か、シェアか）
      - カロリー計算の根拠
      
      その後、以下のJSON形式で結果を出力してください。
      
      {
        "foodName": "料理名",
        "calories": 数値,
        "macros": { "protein": 数値, "fat": 数値, "carbs": 数値 },
        "breakdown": ["食材A", "食材B"],
        "reasoning": "ユーザーに表示する、あなたの分析結果の要約（日本語）"
      }
    `;

    // Try models sequentially
    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`Attempting analysis with model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const text = response.text();

            // Extract JSON
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                // Add model name metadata for debugging
                data.reasoning = `[Model: ${modelName}] ${data.reasoning}`;
                return data;
            } else {
                throw new Error("Failed to parse JSON");
            }

        } catch (e) {
            console.warn(`Model ${modelName} failed:`, e.message);
            lastError = e;
            // Continue to next model
        }
    }

    // Helper to resize image if it's too large (Vercel has 4.5MB limit)
    // ... (resizeImage helper is client-side, wait, actions.js is server side. 
    //  resizeImage was added to aiService.js (client). actions.js is server actions.
    //  So I don't need resizeImage here logic-wise, but good to keep clean.)

    // If all failed
    return { error: `All models failed. Last error: ${lastError?.message}` };
};

export const searchFoodWithGemini = async (query) => {
    if (!apiKey) {
        return { error: "API Key missing" };
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `
      あなたは厳格な栄養データベースです。ユーザーが「${query}」と検索しました。
      実在する、関連性の高い食事候補を10個提案してください。

      【重要: ハルシネーション（嘘の生成）を禁止します】
      - 「${query}」そのものが存在しない・曖昧な場合は、推測で捏造せず、一般的な近い料理や、「該当なし」と判断できる候補を出してください。
      - お店のメニュー名が含まれる場合、公式情報を優先してください。
      - ユーザーが「ラーメンと餃子」のように複数の食品を検索した場合、それぞれの食品について有力な候補を提案してください（例: ラーメンの候補数点、餃子の候補数点）。
      - ユーザーが「ラーメンと餃子」のように複数の食品を検索した場合、それぞれの食品について有力な候補を提案してください（例: ラーメンの候補数点、餃子の候補数点）。
      
      出力形式 (JSONのみ):
      {
        "suggestions": [
          {
            "foodName": "正確な商品名/料理名",
            "calories": 数値 (kcal),
            "macros": { "protein": 数値(g), "fat": 数値(g), "carbs": 数値(g) },
            "reasoning": "選出理由 (例: 2024年現在の公式情報に基づく / 一般的なMサイズ)"
          }
        ]
      }
    `;

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
                // Add model name metadata to each suggestion
                if (data.suggestions) {
                    data.suggestions = data.suggestions.map(s => ({
                        ...s,
                        reasoning: `[Model: ${modelName}] ${s.reasoning}`
                    }));
                }
                return data;
            }
        } catch (e) {
            console.warn(`Search Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: "Failed to search food", details: lastError?.message };
};

export const evaluateDailyLog = async (data) => {
    // data = { date, consumedCalories, targetCalories, meals: [], currentWeight, targetWeight, targetDate }
    if (!apiKey) {
        return { error: "API Key missing" };
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Construct prompt
    const prompt = `
      あなたはプロフェッショナルな専属ダイエットコーチAIです。
      ユーザーの今日の記録と目標に基づいて、厳しくも温かい評価、スコア、そしてアドバイスを提供してください。

      【ユーザー状況】
      - 日付: ${data.date}
      - 現在の体重: ${data.currentWeight || "未計測"} kg
      - 目標体重: ${data.targetWeight || "未設定"} kg
      - 目標期限: ${data.targetDate || "未設定"}

      【今日の摂取状況】
      - 目標カロリー: ${data.targetCalories} kcal
      - 摂取カロリー: ${data.consumedCalories} kcal
      - 残りカロリー: ${data.targetCalories - data.consumedCalories} kcal
      - 食事内容:
      ${data.meals.map(m => `- ${m.foodName} (${new Date(m.timestamp).toLocaleTimeString('ja-JP')}): ${m.calories}kcal, P:${m.macros.protein}g`).join('\n')}

      【タスク】
      1. **スコア (0-100)**: 目標カロリーとの乖離、PFCバランス（特にタンパク質摂取）、食事のタイミング、質の良さを総合的に判断してください。
        - カロリー超過は減点。極端な不足も減点（代謝低下リスク）。
        - タンパク質不足は減点。
      2. **短い評価コメント**: ひとことで言うと？ (例: 「素晴らしい管理です！」「夜食が少し多すぎましたね」)
      3. **詳細アドバイス**: 具体的に何を改善すべきか、または何を続けるべきか。

      出力形式 (JSONのみ):
      {
        "score": 数値,
        "title": "短い評価コメント",
        "advice": "詳細なアドバイス（300文字以内）",
        "reasoning": "[AI思考] なぜこのスコアにしたか（ユーザーには見せませんが、分析の質を高めるために記述してください）"
      }
    `;

    // Try stronger models for coaching reasoning
    // Prioritize 1.5 Pro for "Coaching" quality, then 2.0 Flash for speed
    const COACHING_MODELS = [
        "gemini-1.5-pro",
        "gemini-2.0-flash-exp",
        "gemini-flash-latest"
    ];

    for (const modelName of COACHING_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });

            // Adjust safety settings if needed, but default is usually fine for diet advice
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const resultData = JSON.parse(jsonMatch[0]);
                // Metadata
                resultData.model = modelName;
                return resultData;
            }
        } catch (e) {
            console.warn(`Evaluation Model ${modelName} failed:`, e.message);
        }
    }

    return { error: "Failed to evaluate log" };
};
