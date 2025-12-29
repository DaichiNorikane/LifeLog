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
