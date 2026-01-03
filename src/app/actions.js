"use server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

// Models to try in order of preference
const MODELS_TO_TRY = [
    "gemini-3-flash-preview",
    "gemini-2.0-flash-exp",   // Added 2.0 Flash Experimental as high-quality backup
    "gemini-1.5-pro",         // High reasoning backup
    "gemini-flash-latest"     // Fast fallback
];

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

export const searchFoodWithGemini = async (query, historyContext = "") => {
    if (!apiKey) {
        return { error: "API Key missing" };
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `
      あなたは厳格な栄養データベースです。ユーザーが「${query}」と検索しました。
      実在する、関連性の高い食事候補を10個提案してください。

      【パーソナライズ考慮】
      ユーザーの過去の食事履歴: ${historyContext}
      - もし履歴の中に、検索語句「${query}」と一致または非常に近いものがあれば、それを優先的に上位に提案してください（ユーザーがよく食べるものを出しやすくするため）。
      - ただし、検索語句と関係のない履歴は無視してください。

      【重要: ハルシネーション（嘘の生成）を禁止します】
      - 「${query}」そのものが存在しない・曖昧な場合は、推測で捏造せず、一般的な近い料理や、「該当なし」と判断できる候補を出してください。
      - お店のメニュー名が含まれる場合、公式情報を優先してください。
      - ユーザーが「ラーメンと餃子」のように複数の食品を検索した場合、それぞれの食品について有力な候補を提案してください（例: ラーメンの候補数点、餃子の候補数点）。
      
      出力形式 (JSONのみ):
      {
        "suggestions": [
          {
            "foodName": "正確な商品名/料理名",
            "calories": 数値 (kcal),
            "macros": { "protein": 数値(g), "fat": 数値(g), "carbs": 数値(g) },
            "reasoning": "選出理由 (例: 履歴に基づく / 2024年現在の公式情報)"
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
      4. **食事ごとの評価**: 各食事について、目標に対して「食べて良かった(positive)」「食べなくて良かった(negative)」「どちらでもない(neutral)」の3段階で評価してください。
        - positive: 高タンパク低脂質、栄養バランスが良い、適切なカロリーなど。
        - negative: 高カロリー、高脂質、糖質過多、栄養が偏っている、など。
        - neutral: 普通。

      出力形式 (JSONのみ):
      {
        "score": 数値,
        "title": "短い評価コメント",
        "advice": "詳細なアドバイス（300文字以内）",
        "foodAssessments": [
            { "foodName": "料理名（入力と同じ文字列）", "assessment": "positive" | "negative" | "neutral", "reason": "短い理由" }
        ],
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

export const calculateRecipeWithGemini = async (ingredients) => {
    if (!apiKey) return { error: "API Key missing" };
    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `
      あなたは栄養計算のプロです。以下の食材リストから、料理全体の栄養価を計算してください。
      
      【食材リスト】
      ${ingredients}

      【タスク】
      1. リストの内容を解釈し、一般的な料理名を推測してください。
      2. 提供された食材リスト全体が「何人前」に相当するか推定してください。（例: 豆腐300gとひき肉100gなら概ね2人前など）
      3. **1人前あたり**のカロリーとPFCを計算してください。（全体の栄養価 ÷ 推定人数）

      出力形式 (JSONのみ):
      {
        "foodName": "推測される料理名",
        "calories": 1人前あたりの数値 (kcal/整数),
        "macros": { "protein": 1人前数値(g), "fat": 1人前数値(g), "carbs": 1人前数値(g) },
        "reasoning": "計算の根拠（例: 全体を2人前と推定。合計XXXkcal ÷ 2...）"
      }
    `;

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`Calculating recipe with model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.warn(`Recipe Calc Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: `All models failed. Last check: ${lastError?.message}` };
};

export const suggestNextMeal = async (history, dailyLog, targetType = 'dinner') => {
    // Map targetType to Japanese label
    const labels = {
        breakfast: '朝食',
        lunch: '昼食',
        dinner: '夕食',
        snack: '間食・おやつ'
    };
    const mealCategory = labels[targetType] || '食事';
    const hour = new Date().getHours();

    const prompt = `
        あなたはプロの管理栄養士です。
        現在の時刻は${hour}時です。ユーザーは**${mealCategory}**の提案を求めています。
        ユーザーの食事履歴と、本日の摂取状況から、次の${mealCategory}で何を食べると栄養バランスが整うか、具体的に提案してください。

        【ユーザーの直近の食事履歴】
        ${history.map(m => `- ${m.foodName} (${m.calories}kcal)`).join('\n')}

        【本日の摂取状況】
        - 総摂取カロリー: ${dailyLog.totalCalories} kcal
        - P (タンパク質): ${dailyLog.macros.protein} g
        - F (脂質): ${dailyLog.macros.fat} g
        - C (炭水化物): ${dailyLog.macros.carbs} g
        - 目標カロリー: ${dailyLog.targetCalories} kcal

        【提案のルール】
        1. ${mealCategory}にふさわしい具体的なメニュー名と、なぜそれが良いかを1文で説明してください。
        2. 3つ提案してください。
        3. 出力はJSON形式のみで、以下の構造にしてください。
        {
            "mealCategory": "${mealCategory}",
            "suggestions": [
                { "name": "メニュー名", "reason": "理由" },
                ...
            ],
            "advice": "全体的なアドバイスを1文で"
        }
    `;

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            if (!apiKey) throw new Error("API Key is missing.");
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().replace(/```json\n?|\n?```/g, "").trim();
            const jsonMatch = text.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.warn(`Suggestion Model ${modelName} failed:`, error.message);
            lastError = error;
        }
    }

    return { suggestions: [], advice: `現在AIアドバイスを利用できません。(理由: ${lastError?.message || "All models failed"})` };
};

export const searchRecipesWithGemini = async (query) => {
    const prompt = `
        あなたは料理のアシスタントです。
        ユーザーの要望「${query}」に基づき、おすすめのレシピ（メニュー）を**3つ**提案してください。
        
        【重要な方針】
        - 詳しい作り方や分量は生成しないでください（ユーザーは外部のレシピサイトで確認します）。
        - その代わり、ユーザーがGoogleやクックパッド等で検索するための「最適な検索キーワード」を提供してください。
        - カロリーやPFCバランスは、一般的な目安として推測して出力してください。

        【要件】
        1. 3つの異なるバリエーションを提案。
        2. 以下のJSON形式で出力すること。

        {
            "recipes": [
                {
                    "foodName": "料理名",
                    "description": "魅力的な短い説明",
                    "ingredients": "（詳細は検索リンク先でご確認ください）",
                    "instructions": [],
                    "calories": 推定カロリー(数値),
                    "macros": { "protein": 数値, "fat": 数値, "carbs": 数値 },
                    "sourceQuery": "Google検索用の最適なキーワード（例: 豚肉 キャベツ 味噌炒め レシピ 人気）"
                },
                ...
            ]
        }
    `;

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            if (!apiKey) throw new Error("API Key is missing.");
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().replace(/```json\n?|\n?```/g, "").trim();
            const jsonMatch = text.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.warn(`Recipe Search Model ${modelName} failed:`, error.message);
            lastError = error;
        }
    }

    throw lastError || new Error("Recipe search failed");
};
