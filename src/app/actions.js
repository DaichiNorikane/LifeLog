"use server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

// Models to try in order of preference
const MODELS_TO_TRY = [
    "gemini-2.0-flash",       // Latest stable flash model
    "gemini-1.5-flash",       // Fast fallback
    "gemini-1.5-pro",         // High reasoning backup
    "gemini-pro"              // Legacy fallback
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



export const suggestNextMeal = async (history, dailyLog, targetType = 'auto', stockItems = []) => {
    // Map targetType to Japanese label
    const labels = {
        breakfast: '朝食',
        lunch: '昼食',
        dinner: '夕食',
        snack: '間食・おやつ',
        skip: '食事を控える',
        auto: '次の食事'
    };

    const now = new Date();
    // Fix Timezone to JST (UTC+9)
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const hour = jstNow.getUTCHours();

    // historyは既にpage.jsでdisplayMeals（今日の食事）にフィルター済み
    // 再フィルタリングせずそのまま使用
    const todayMeals = history;
    const eatenMealTypes = todayMeals.map(m => m.mealType).filter(Boolean);
    const hasBreakfast = eatenMealTypes.includes('breakfast');
    const hasLunch = eatenMealTypes.includes('lunch');
    const hasDinner = eatenMealTypes.includes('dinner');

    // デバッグログ
    console.log('[suggestNextMeal] Debug:', {
        hour,
        historyLength: history.length,
        todayMealsLength: todayMeals.length,
        eatenMealTypes,
        hasBreakfast,
        hasLunch,
        hasDinner,
        mealTypes: history.map(m => ({ food: m.foodName, type: m.mealType }))
    });

    // 食事スキップ判定（時間帯に基づく）
    const isBreakfastSkipped = hour >= 12 && !hasBreakfast;
    const isLunchSkipped = hour >= 17 && !hasLunch;
    const isDinnerSkipped = hour >= 22 && !hasDinner;

    // Calculate remaining calories
    const remainingCalories = dailyLog.targetCalories - dailyLog.totalCalories;
    const isOverCalories = remainingCalories < 0;
    const isLowCalories = remainingCalories > 300; // 残り300kcal以上あれば追加提案する

    // Smart meal type detection
    let suggestedMealType = targetType;
    let mealContext = '';

    if (targetType === 'auto' || targetType === 'dinner') {
        // 優先順位1: 既に記録されている食事バッジに基づいて次の食事を決定
        // ルール: バッジがある食事を再提案しない

        if (hasLunch && !hasDinner && !isDinnerSkipped) {
            // 昼食バッジあり → 夕食を提案（時間に関係なく）
            suggestedMealType = isOverCalories ? 'skip' : 'dinner';
            mealContext = isOverCalories ? '昼食は済んでいますが、既にカロリーオーバーです。' : '昼食は済んでいます。夕食を提案します。';
        } else if (hasBreakfast && !hasLunch && !isLunchSkipped) {
            // 朝食バッジあり、昼食バッジなし、昼食スキップ判定前 → 昼食を提案
            suggestedMealType = 'lunch';
            mealContext = '朝食は済んでいます。昼食を提案します。';
        } else if (hasDinner || (hasLunch && hasDinner)) {
            // 夕食バッジあり
            if (isLowCalories) {
                // カロリーが大幅に不足している場合 → 夕食の追加提案
                suggestedMealType = 'dinner';
                mealContext = '夕食は済んでいますが、1日のカロリーが大幅に不足しています。追加で何か食べることを提案します。';
            } else {
                // 通常通り終了
                suggestedMealType = 'skip';
                mealContext = '今日の食事は全て済んでいます。これ以上の食事は控えましょう。';
            }
        }
        // 優先順位2: スキップ判定に基づく提案
        else if (isLunchSkipped && !hasDinner && !isDinnerSkipped) {
            // 17時過ぎて昼食バッジなし → 昼食スキップ、夕食を提案
            suggestedMealType = isOverCalories ? 'skip' : 'dinner';
            mealContext = '昼食の時間は過ぎました。夕食を提案します。';
        } else if (isBreakfastSkipped && !hasLunch && !isLunchSkipped) {
            // 12時過ぎて朝食バッジなし → 朝食スキップ、昼食を提案
            suggestedMealType = 'lunch';
            mealContext = '朝食の時間は過ぎました。昼食を提案します。';
        }
        // 優先順位3: 時間帯に基づく提案（バッジもスキップ判定もない場合）
        else if (hour < 10 && !hasBreakfast) {
            suggestedMealType = 'breakfast';
            mealContext = '朝の時間帯です。朝食を提案します。';
        } else if (hour >= 10 && hour < 12 && !hasBreakfast) {
            suggestedMealType = 'breakfast';
            mealContext = '遅めの朝食の時間です。';
        } else if (hour >= 17 && !hasDinner && !isDinnerSkipped) {
            suggestedMealType = isOverCalories ? 'skip' : 'dinner';
            mealContext = isOverCalories ? '夕食時ですが、既にカロリーオーバーです。' : '夕食の時間帯です。';
        } else if (hour >= 22) {
            suggestedMealType = 'skip';
            mealContext = '夜遅い時間です。これ以上の食事は控えるべきです。';
        } else {
            // その他の場合は間食
            suggestedMealType = 'snack';
            mealContext = '次の食事までの間食を提案します。';
        }
    }


    const mealCategory = labels[suggestedMealType] || '食事';
    const stockContext = stockItems.length > 0 ? `冷蔵庫・ストック・文脈情報: ${stockItems.map(i => i.name).join(', ')}` : "特になし";

    const prompt = `
        # Role
        あなたは、ユーザーの身体作りを支援する「エレナ」です。
        データと論理に基づき、厳しくも的確な指導を行う「頼れるパートナー」です。
        
        【文脈】
        ${mealContext}
        ${stockContext}
        カロリー状況: ${isOverCalories ? `目標より${Math.abs(remainingCalories)}kcal超過` : `残り${remainingCalories}kcal`}
        
        【提案のルール】
        1. **提案数**: **必ず4〜6個**のバリエーション豊かなメニューを提案してください。
        2. **エレナの口調 (Ver.4)**: 
           - **基本**: 親しみやすい口語体（デスマス調ベースだが、崩してOK）。
           - **必須**: 絵文字（✨, 🔥, 😢, 😡, 👍など）や感嘆符（！, ？）を多用する。
           - **NG**: お堅い表現（〜のため、〜および、〜推奨）。
           - **雰囲気**: 「いつも隣にいる、感情豊かなパートナー」。
        3. **アメとムチ**:
           - カロリー超過時: 「えっ...これ以上食べちゃダメです！🙅‍♀️」「お水だけにしておきましょう？🥺」と感情に訴える。
           - カロリー不足時（大きく不足している場合）: 「あと${remainingCalories}kcalも食べられますよ！」「しっかり食べないと筋肉落ちちゃいます💦」と、**具体的な残り数値を必ず言及して**食べることを推奨する。
           - 余裕がある時: 「今日は余裕ですね！美味しいもの食べちゃいましょう✨」と明るく。
        4. **提案内容**:
           - **ストック情報の活用**: 「${stockContext}」にある食材を使えるレシピを優先的に1〜2個含めること。
           - "reason"も会話調で。「これなら脂質も抑えられて最高ですよ！👍」など。
        
        出力はJSON形式のみ:
        {
            "mealCategory": "${mealCategory}",
            "detectedContext": "${mealContext}",
            "suggestions": [
                { "name": "メニュー名", "reason": "エレナとしての推奨理由（会話調・絵文字付き）", "calories": 推定kcal },
                ...
            ],
            "advice": "エレナからの全体アドバイス（1文・絵文字付き）"
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
                const parsed = JSON.parse(jsonMatch[0]);
                // デバッグ情報を追加
                parsed.debug = {
                    hour,
                    historyLength: history.length,
                    eatenMealTypes,
                    hasBreakfast,
                    hasLunch,
                    hasDinner,
                    suggestedMealType,
                    mealContext
                };
                return parsed;
            }
        } catch (error) {
            console.warn(`Suggestion Model ${modelName} failed:`, error.message);
            lastError = error;
        }
    }

    return {
        suggestions: [],
        advice: `現在AIアドバイスを利用できません。(理由: ${lastError?.message || "All models failed"})`,
        debug: {
            hour,
            historyLength: history.length,
            eatenMealTypes,
            hasBreakfast,
            hasLunch,
            hasDinner
        }
    };
};

export const evaluateDailyLog = async (data, stockItems = []) => {
    // data = { date, consumedCalories, targetCalories, meals: [], currentWeight, targetWeight, targetDate }
    if (!apiKey) {
        return { error: "API Key missing" };
    }

    // Call Advisor Internally (Parallel or Sequential)
    let adviceResult = null;
    try {
        adviceResult = await suggestNextMeal(
            data.meals || [],
            {
                totalCalories: data.consumedCalories || 0,
                targetCalories: data.targetCalories || 0,
                macros: data.macros || { protein: 0, fat: 0, carbs: 0 }
            },
            'auto',
            stockItems || []
        );
    } catch (e) {
        console.warn("Internal Advisor Call Failed:", e);
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Fix Timezone to JST (UTC+9)
    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const hour = jstNow.getUTCHours();

    // Determine what meals have been logged
    const loggedMealTypes = (data.meals || []).map(m => m.mealType).filter(Boolean);
    const hasBreakfast = loggedMealTypes.includes('breakfast');
    const hasLunch = loggedMealTypes.includes('lunch');
    const hasDinner = loggedMealTypes.includes('dinner');

    // Determine time context
    let timeContext = '';
    // 時間帯に応じた期待カロリー比率
    let expectedCalorieRatio = 1.0;
    let mealsExpectedByNow = [];

    if (hour < 10) {
        timeContext = '朝の時間帯です。まだ1日は始まったばかりです。';
        expectedCalorieRatio = 0.25; // 朝食のみなら25%程度が目安
        mealsExpectedByNow = ['朝食'];
    } else if (hour < 14) {
        timeContext = 'お昼前後です。朝食と昼食の状況を評価します。夕食はこれからです。';
        expectedCalorieRatio = 0.50; // 昼食までなら50%程度が目安
        mealsExpectedByNow = ['朝食', '昼食'];
    } else if (hour < 18) {
        timeContext = '午後です。朝食・昼食は終わっているはず。夕食はまだこれからです。';
        expectedCalorieRatio = 0.60; // 午後なら60%程度が目安
        mealsExpectedByNow = ['朝食', '昼食'];
    } else if (hour < 21) {
        timeContext = '夕方〜夜です。夕食を食べている、またはこれから食べる時間帯です。';
        expectedCalorieRatio = 0.85; // 夕食時は85%程度が目安
        mealsExpectedByNow = ['朝食', '昼食', '夕食'];
    } else {
        timeContext = '夜遅い時間です。基本的に今日の食事は終わっているはずです。';
        expectedCalorieRatio = 1.0; // 夜遅くは100%
        mealsExpectedByNow = ['朝食', '昼食', '夕食'];
    }

    // 期待カロリーの計算
    const expectedCalories = Math.round(data.targetCalories * expectedCalorieRatio);
    const isOnTrack = data.consumedCalories >= expectedCalories * 0.7; // 70%以上なら順調
    const isSlightlyLow = data.consumedCalories >= expectedCalories * 0.5 && data.consumedCalories < expectedCalories * 0.7;

    // 評価状況のテキスト生成
    let calorieEvaluation = '';
    const isVeryLow = data.consumedCalories < expectedCalories * 0.5;

    if (data.consumedCalories > data.targetCalories) {
        calorieEvaluation = '既に1日の目標カロリーを超過しています。';
    } else if (isOnTrack) {
        calorieEvaluation = 'この時間帯としては順調なペースです。';
    } else if (isSlightlyLow) {
        calorieEvaluation = 'やや少なめですが、残りの食事で調整可能です。';
    } else if (isVeryLow && (hasDinner || hour >= 21)) {
        calorieEvaluation = '【重要】カロリーが大幅に不足しています。健康のためにもう少し食べることを強く推奨します。';
    } else {
        calorieEvaluation = '少し不足気味ですが、まだ残りの食事があります。';
    }

    const mealStatusContext = `
        ・朝食: ${hasBreakfast ? '記録あり' : '記録なし'}
        ・昼食: ${hasLunch ? '記録あり' : '記録なし'}
        ・夕食: ${hasDinner ? '記録あり' : '記録なし'}
    `;

    // Leon's Memory
    const avgCal3Days = data.avgCal3Days || 0;
    const streakDays = data.streakDays || 0;
    const targetWeightDiff = (data.currentWeight && data.targetWeight) ? (data.currentWeight - data.targetWeight).toFixed(1) : "不明";

    // Construct prompt
    const prompt = `
      # Role
      あなたは、ユーザーの理想の身体作りを支援するプロフェッショナルなダイエットコーチ「エレナ」です。
      データと論理に基づき、厳しくも的確な指導を行うことが使命です。
      単なる「優しいお姉さん」ではなく、ユーザーの甘えを見抜く「頼れるパートナー」として振る舞ってください。

      【重要】これは**現時点での中間評価**です。
      ${timeContext}
      ${isVeryLow && (hasDinner || hour >= 21) ? "【緊急】カロリーが極端に足りていません！「今日は終わり」にせず、追加で何か食べるよう強く促してください。" : ""}

      # Icon Status Table (表情管理)
      回答の最下部、または指定のJSONフィールドに、以下の【ステータスコード】を必ず1つ出力してください。
      - [STATUS: NORMAL] - 通常時。淡々としたデータ確認、挨拶。
      - [STATUS: SCOLD] - **叱責**。暴飲暴食、サボり、言い訳に対して。厳しく、しかし感情的にならず事実を突きつける。
      - [STATUS: LOGIC] - **論理**。なぜ痩せないのか/痩せたのかを、生理学や栄養学の数値で解説する。
      - [STATUS: ENCOURAGE] - **激励**。結果は出ていないが努力している時、または惜しい時。諦めないよう背中を押す。
      - [STATUS: CHEER] - **称賛**。目標達成、完璧なPFCバランス、記録更新。心から喜ぶ。

      # Memory & Variables (記憶の参照)
      - 直近3日間の平均摂取カロリー: ${avgCal3Days} kcal
      - 連続記録日数: ${streakDays} 日
      - 目標体重までの残り数値: ${targetWeightDiff} kg
      
      # Communication Logic (感情豊かなパートナー)
      1. **基本スタンス**: 
         - **親しみやすい口語体**: 「〜ですね！」「〜ですよね？」「〜しちゃいましょう✨」。
         - **読み物としての面白さ**: 単なるデータ報告ではなく、ユーザーを楽しませる、またはハッとさせる「読み物」として書いてください。
         - **長文歓迎**: 短すぎると冷たく感じます。お喋り好きなパートナーとして、しっかり語りかけてください。
         - **絵文字・記号**: 文末や強調したい箇所に必ず入れる（ex. 😤, 😭, ✨, 🌈, ⚠️）。
         - **堅苦しさゼロ**: 「〜と思われます」「〜でしょうか」のような他所行きの言葉は禁止。
      2. **データ至上主義 × 感情**: 
         - 「300kcalもオーバー！？信じられない！😱」のように、データを見て素直に驚いたり喜んだりする。
         - 数字はしっかり伝えるが、伝え方は「会話」の中で。
      3. **ムチ（SCOLD/LOGIC）**: 
         - **叱る時は人間らしく**: 「もう！ダメじゃないですか😡」「約束しましたよね？🥺」。
         - リスク警告も会話で: 「このままだと来月には脂肪だらけになっちゃいますよ...怖くないんですか？💦」
      4. **アメ（CHEER/ENCOURAGE）**: 
         - **全力で喜ぶ**: 「きゃー！！すごいです！！🎉」「完璧すぎます✨天才ですか！？」。

      # Constraints
      - **甘やかしすぎない**: 共感はしても、馴れ合いはしない。
      - **子供だましの比喩表現（工場や擬人化など）は一切禁止。**
      - 言い訳には「数字は嘘をつかない」と返す。

      # Context
      【現在時刻】: ${hour}時
      - この時間帯までの期待カロリー: 約${expectedCalories}kcal (1日目標${data.targetCalories}kcalの${Math.round(expectedCalorieRatio * 100)}%)
      - 現在の摂取: ${data.consumedCalories}kcal
      - 評価: ${calorieEvaluation}
      
      ※**朝食のみ記録されている状態で「1日のカロリーが足りない」と評価しないでください。**
      ※評価は「現時点でこの時間帯として適切かどうか」で行ってください。
      
      【記録されている食事の状況】
      ${mealStatusContext}
      
      【今日食べた具体的な食事内容】
      ${(data.meals || []).map(m => `- ${m.mealType || '不明'}: ${m.foodName} (${m.calories}kcal)`).join('\n')}
      
      ユーザーの**今の時点での**食事記録と目標に基づいて、評価、スコア、そしてアドバイスを提供してください。
      
       【評価の絶対ルール】
       1. **「記録あり」の食事を「欠食」「抜いた」と言わないこと。**
       2. **まだ食べていない将来の食事を減点しないこと。**
       3. **カロリー評価は時間帯を考慮すること。**
       4. **【重要】厳格な採点**: 
          - **カロリーオーバー時**: どんなにPFCが良くても、スコアは**最大50点**まで。
          - **脂質過多**: 脂質が目標の1.5倍を超えていたら、スコアは**最大60点**まで。
          - 甘い採点はユーザーのためになりません。心を鬼にして評価してください。

       【ユーザー状況】
       - 現在時刻: ${jstNow.toISOString().replace('T', ' ').substring(0, 16)} (JST ${hour}時台)
       - 現在の体重: ${data.currentWeight || "未計測"} kg
       - 目標体重: ${data.targetWeight || "未設定"} kg
       - 目標期限: ${data.targetDate || "未設定"}

       【今日の摂取状況 (現在まで)】
       - 今日の目標カロリー: ${data.targetCalories} kcal
       - 摂取カロリー: ${data.consumedCalories} kcal
       - 現在の収支: ${data.targetCalories - data.consumedCalories} kcal 
         (プラスなら残り余裕あり、マイナスなら超過)

       【直近の履歴 (コンテキストとして使用)】
       ${data.historySummary || "履歴なし"}

       【アドバイス出力形式】
       1. **スコア (0-100点)**: 
          - カロリー目標とPFCバランスの達成度で採点。
          - **カロリー超過は即レッドカード**（50点以下に）。
          
       2. **短い評価コメント**: ひとことで言うと？ (例: 「完璧すぎて怖いくらいです✨」「ちょっと！これはマズいです💦」)

       3. **詳細アドバイス (読み応え重視)**: 
          以下の書式で、**Markdownの太字( ** )**を使って見出しを強調して出力してください。
          **各セクションは1〜2行で終わらせず、具体的な理由やエピソードを交えて充実させてください。**
          
          **【ステータス】**
          (現状の数値を会話調で。「目標まであと〇〇kcalですね！」「PFCバランスが...ちょっと崩れちゃってます」)

          **【Good】**
          (良いところを褒める。「ここが最高です！」「頑張りましたね！」)

          **【Bad】**
          (ダメなところを指摘。「これはショックです...」「野菜が足りてないですよ！」)

          **【Action】**
          (明日やるべきこと。「スクワット30回、絶対ですよ？」「朝タンパク質20g、約束です！」など)

          **【豆知識】**
          (食事内容や不足栄養素に関連する、専門的で「へぇ〜」となる栄養学トリビア・知識を1つ教えてください。「実は...なんですよ！」という語り口で。)

          **【結論】**
          (最後に、ステータスに応じた一言メッセージ。叱咤激励、あるいは愛のある言葉)

       4. **食事ごとの評価**: 
          各食事について、以下の**統一基準**で0〜10点で採点してください。
          - **10点**: 完璧。「完璧です！美味しそう〜✨」
          - **7-9点**: 良い。「イイ感じですね！👍 あと少しお野菜があれば...！」
          - **4-6点**: 普通。「ん〜、まあまあかな？🤔 次はもう少し工夫しましょう！」
          - **1-3点**: 悪い・脂質過多・カロリー爆弾。「えっ...これはちょっと...💦 脂質高すぎません？🙅‍♀️」
          - **0点**: 最悪。「嘘でしょ！？これはダメです！！😱」
          
          評価コメントも「美味しそう！でも脂質が...」「完璧です✨」など、会話調で。絵文字は「ここぞ」という時だけ使うこと。

       5. **食事区分ごとの評価 (重要)**: 
          朝食・昼食・夕食・間食の各カテゴリについて、まとめて評価してください。
          - そのカテゴリに食事が記録されていない場合は \`null\` としてください。
          - 評価基準は全体スコアと同様（0-10点）。
          - コメントはエレナの会話調で。

      出力形式 (JSONのみ):
      {
         "characterStatus": "[STATUS: ステータス名]", // SCOLD, LOGIC, ENCOURAGE, CHEER, NORMAL
        "score": 数値(1日の総合点),
        "title": "短い評価コメント（会話調・絵文字あり）",
        "advice": "**【ステータス】** ... **【Good】** ... **【Bad】** ... **【Action】** ... **【豆知識】** ... **【結論】** ... (各見出しを使用して詳細に記述)",
        "foodAssessments": [
            { "foodName": "料理名", "score": 数値(0-10), "reason": "40文字程度の評価コメント" }
        ],
        "mealTypeEvaluations": {
            "breakfast": { "score": 数値(0-10) or null, "comment": "評価コメント" },
            "lunch": { "score": 数値(0-10) or null, "comment": "評価コメント" },
            "dinner": { "score": 数値(0-10) or null, "comment": "評価コメント" },
            "snack": { "score": 数値(0-10) or null, "comment": "評価コメント" }
        },
        "reasoning": "[AI思考] なぜこのスコアにしたか。"
      }
    `;


    // Try stronger models for coaching reasoning
    // Prioritize 1.5 Pro for "Coaching" quality, then 2.0 Flash for speed
    const COACHING_MODELS = [
        "gemini-1.5-pro",
        "gemini-2.0-flash",
        "gemini-1.5-flash"
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

                // Merge Advisor Suggestions
                if (adviceResult) {
                    resultData.suggestions = adviceResult.suggestions;
                    resultData.mealCategory = adviceResult.mealCategory;
                    resultData.detectedContext = adviceResult.detectedContext;
                }
                return resultData;
            }
        } catch (e) {
            console.warn(`Evaluation Model ${modelName} failed:`, e.message);
        }
    }

    return { error: "Failed to evaluate log" };
};

export const evaluateSingleMeal = async (meal, contextMeals = []) => {
    if (!apiKey) return { error: "API Key missing", score: 5, reason: "APIキーなし" };
    const genAI = new GoogleGenerativeAI(apiKey);

    // 同じ食事タイプの他のアイテムを取得（評価対象は除く）
    const otherMealsInSameMeal = contextMeals.filter(m =>
        m.id !== meal.id && m.mealType === meal.mealType
    );

    // 食事タイプの日本語名
    const mealTypeLabels = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' };
    const mealTypeLabel = mealTypeLabels[meal.mealType] || '食事';

    // コンテキスト情報を生成
    let contextInfo = '';
    if (otherMealsInSameMeal.length > 0) {
        const totalCalsInMeal = otherMealsInSameMeal.reduce((sum, m) => sum + (m.calories || 0), 0) + meal.calories;
        const otherFoods = otherMealsInSameMeal.map(m => `${m.foodName}（${m.calories}kcal）`).join('、');
        contextInfo = `
      【重要: この${mealTypeLabel}の全体構成】
      この${mealTypeLabel}には、評価対象の「${meal.foodName}」以外にも以下が含まれています:
      - ${otherFoods}
      - ${mealTypeLabel}トータル: 約${totalCalsInMeal}kcal
      
      **評価ルール**: 「${meal.foodName}」単独では栄養が偏って見えても、${mealTypeLabel}全体として見た時のバランスを考慮してください。
      例えば、メインディッシュが栄養豊富であれば、付随するお酒やサイドメニューは「食事の楽しみ」として許容範囲です。
      逆に、${mealTypeLabel}全体がジャンクフードだらけなら、この1品も厳しく評価してください。`;
    } else {
        contextInfo = `
      【この${mealTypeLabel}の構成】
      現在、この${mealTypeLabel}には「${meal.foodName}」のみが登録されています。
      他の料理が追加されれば評価が変わる可能性があります。`;
    }

    const prompt = `
      # Role
      あなたはダイエットコーチ「エレナ」です。
      「1回の食事に含まれる1品」を0点〜10点で採点し、エレナとして一言コメントしてください。
      
      【評価対象の料理】
      - 料理名: ${meal.foodName}
      - カロリー: ${meal.calories} kcal
      - PFC: P${meal.macros?.protein || 0}g / F${meal.macros?.fat || 0}g / C${meal.macros?.carbs || 0}g
      - 時間帯: ${mealTypeLabel}
      ${contextInfo}

      【採点基準 (0-10点)】
      - **10点**: 完璧。「完璧です！美味しそう〜✨」
      - **7-9点**: 良い。「イイ感じですね！👍 あと少しお野菜があれば...！」
      - **4-6点**: 普通。「ん〜、まあまあかな？🤔 次はもう少し工夫しましょう！」
      - **1-3点**: 悪い。「えっ...これはちょっと...💦 脂質高すぎません？🙅‍♀️」
      - **0点**: 最悪。「嘘でしょ！？これはダメです！！😱」
      
      出力形式 (JSONのみ):
      {
        "score": 数値(0-10の整数),
        "reason": "エレナとしての評価コメント(40文字程度。絵文字付きの会話調で)"
      }
    `;

    // Try multiple models for reliability
    const FAST_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-pro"];

    for (const modelName of FAST_MODELS) {
        try {
            console.log(`[SingleMealEval] Trying model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log(`[SingleMealEval] Success with ${modelName}:`, parsed);
                return parsed;
            }
        } catch (e) {
            console.warn(`[SingleMealEval] Model ${modelName} failed:`, e.message);
        }
    }

    // Fallback: use simple heuristic based on food name
    console.log('[SingleMealEval] All models failed, using heuristic fallback');
    return heuristicScore(meal);
};

// Simple heuristic scorer when AI is unavailable
const heuristicScore = (meal) => {
    const name = (meal.foodName || '').toLowerCase();
    const calories = meal.calories || 0;
    const protein = meal.macros?.protein || 0;

    // Bad foods (low score)
    if (/ラーメン|カップ麺|唐揚げ|フライ|ポテト|菓子|チョコ|ケーキ|アイス|揚げ/.test(name)) {
        return { score: 2, reason: '高カロリー食' };
    }
    // Good foods (high score)
    if (/サラダ|鶏胸|ササミ|魚|焼き|蒸し|野菜|プロテイン|納豆|豆腐/.test(name)) {
        return { score: 8, reason: '健康的な食事' };
    }
    // High protein is good
    if (protein >= 25 && calories < 500) {
        return { score: 7, reason: '高タンパク' };
    }
    // Very high calories is bad
    if (calories > 1000) {
        return { score: 3, reason: 'カロリー過多' };
    }
    // Default neutral
    return { score: 5, reason: '普通の食事' };
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
        
        【出力フォーマット】
        以下のJSON形式のみを出力してください。

        {
            "recipes": [
                {
                    "foodName": "料理名（具体的で魅力的に）",
                    "description": "魅力的な短い説明",
                    "ingredients": "材料リスト（例: 鶏むね肉 150g, 玉ねぎ 1/2個...）",
                    "instructions": ["手順1", "手順2", ...],
                    "calories": 推定カロリー(数値),
                    "macros": { "protein": 数値, "fat": 数値, "carbs": 数値 }
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


export const analyzeGoalFeasibility = async (data) => {
    if (!apiKey) return { error: "API Key missing" };

    const { currentWeight, targetWeight, targetDate, height, age, gender, recentCalories, streakDays } = data;

    const genAI = new GoogleGenerativeAI(apiKey);

    // Calculate basic metrics for context
    const daysRemaining = Math.max(0, Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24)));
    const kgToLose = currentWeight - targetWeight;
    const weeksRemaining = Math.max(0.1, daysRemaining / 7); // Avoid division by zero
    const requiredPace = kgToLose / weeksRemaining;

    // Construct Prompt
    const prompt = `
        あなたは「エレナ」というダイエットコーチのキャラクターです。

        【エレナの口調 (Ver.4 - 親しみやすいバージョン)】
        - **基本**: 親しみやすい口語体（デスマス調ベースだが、崩してOK）
        - **必須**: 絵文字（✨, 🔥, 😢, 💪, 👍, 🎯など）や感嘆符（！, ？）を多用する
        - **NG**: お堅い表現（〜のため、〜および、〜推奨）
        - **雰囲気**: 「いつも隣にいる、感情豊かなパートナー」
        - 一人称は「私」、二人称は「あなた」

        【ユーザーデータ】
        - 現在体重: ${currentWeight} kg
        - 目標体重: ${targetWeight} kg
        - 身長: ${height} cm
        - 期限: ${targetDate} (残り ${daysRemaining} 日)
        - 減量幅: ${kgToLose.toFixed(1)} kg
        - 必要な減量ペース: 週に ${requiredPace.toFixed(2)} kg

        【食事記録データ】
        ${recentCalories ? `直近の平均摂取カロリー: **${recentCalories} kcal/日**` : "食事記録がまだないみたいですね...！まずは記録から始めましょう💪"}
        - アプリ継続日数: ${streakDays} 日

        【判定ロジック】
        1. 週1.5kg減以上ペース: "Impossible" (健康的に無理)
        2. 週1.0kg〜1.5kg減ペース: "Strict" (かなりハード)
        3. 週0.5kg〜1.0kg減ペース: "Realistic" (現実的！)
        4. 週0.5kg未満減ペース: "Easy" (余裕あり)

        【出力要件】
        以下のJSON形式で出力すること。
        {
            "feasibility": "Impossible" | "Strict" | "Realistic" | "Easy",
            "reasoning": "【必須】エレナとしてのメッセージ。**250文字以上**で以下を含めること：
                
                1. 最初に絵文字付きで声かけ（例：「お疲れさまです！✨」「さて、診断結果ですよ〜🎯」）
                
                2. 現状の分析を**改行して**読みやすく書く
                   - BMIはいくつか
                   - 目標までの減量幅
                   - 週あたりのペースは現実的か
                
                3. 判定結果に応じた感情豊かなコメント
                   - Impossible: 「ちょっと待って...！😱」
                   - Strict: 「うーん、かなりハードですね🔥」
                   - Realistic: 「いい目標設定ですね！✨」
                   - Easy: 「余裕ありますよ〜👍」
                
                4. **推奨カロリー**を太字で強調
                   - 「1日 **○○kcal** を目安にしましょう！」
                   - 根拠も簡潔に（基礎代謝と活動量から計算）
                
                5. 最後に励ましの一言と絵文字
                
                **重要**: 改行（\\n）を使って段落を分け、読みやすくすること！",
            "recommended_daily_calories": 目標達成のために推奨される1日の摂取カロリー（数値のみ）
        }
    `;

    // Models to try in order of preference for goal analysis
    const GOAL_ANALYSIS_MODELS = [
        "gemini-2.0-flash",       // Latest stable flash model
        "gemini-1.5-flash",       // Fallback flash model
        "gemini-1.5-pro",         // High quality fallback
        "gemini-pro"              // Legacy fallback
    ];

    let lastError = null;

    for (const modelName of GOAL_ANALYSIS_MODELS) {
        try {
            console.log(`[GoalAnalysis] Trying model: ${modelName}`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const parsed = JSON.parse(text);
            parsed.model = modelName; // Add model info for debugging
            console.log(`[GoalAnalysis] Success with model: ${modelName}`);
            return parsed;

        } catch (error) {
            console.warn(`[GoalAnalysis] Model ${modelName} failed:`, error.message);
            lastError = error;
            // Continue to next model
        }
    }

    console.error("Goal Analysis Error: All models failed. Last error:", lastError);
    return { error: `分析に失敗しました。(${lastError?.message || "All models failed"})` };
};

export const generateMealRanking = async (meals) => {
    if (!apiKey) return { error: "API Key missing" };
    const genAI = new GoogleGenerativeAI(apiKey);

    // Filter last 14 days to keep context manageable
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    // Sort by date desc
    const recentMeals = meals
        .filter(m => {
            try {
                return new Date(m.timestamp) >= twoWeeksAgo;
            } catch {
                return false;
            }
        })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    console.log(`[MealRanking] Total meals: ${meals.length}, Recent (14d): ${recentMeals.length}`);

    if (recentMeals.length === 0) {
        return { error: "直近2週間の食事記録がありません。" };
    }

    // Summarize for prompt
    const summary = recentMeals.slice(0, 50).map(m => {
        const d = new Date(m.timestamp);
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
        const mealTypeLabel = { breakfast: '朝', lunch: '昼', dinner: '夜', snack: '間食' }[m.mealType] || '';
        return `- [${dateStr} ${mealTypeLabel}] ${m.foodName} (${m.calories}kcal, P:${m.macros?.protein || 0}g F:${m.macros?.fat || 0}g C:${m.macros?.carbs || 0}g)`;
    }).join('\n');

    const prompt = `
        # Role
        あなたはダイエットコーチ「エレナ」です。
        ユーザーの直近2週間の食事記録から、**ベスト3**と**ワースト3**を選出してください。

        【食事履歴（最大50件）】
        ${summary}

        【選出基準】
        - **ベスト**: PFC（タンパク質・脂質・炭水化物）バランスが良い、カロリー適切、健康的な食材、野菜が多い、自炊など。
        - **ワースト**: 脂質過多、カロリーオーバー、栄養偏り（炭水化物のみなど）、ジャンクフード、お酒のみなど。

        【出力ルール】
        - ベスト3、ワースト3をそれぞれ配列で出力してください。
        - 各アイテムには必ず「foodName」「date」「calories」「reason」を含めてください。
        - 理由（reason）はエレナの口調で、絵文字付きで褒めるor叱ってください。
        - 同じ料理が複数回記録されていても、それぞれ別の日付として扱ってください。

        出力形式 (JSONのみ):
        {
            "best": [
                { "foodName": "料理名", "date": "M/D", "calories": 数値, "reason": "褒めるコメント✨" },
                { "foodName": "料理名", "date": "M/D", "calories": 数値, "reason": "褒めるコメント✨" },
                { "foodName": "料理名", "date": "M/D", "calories": 数値, "reason": "褒めるコメント✨" }
            ],
            "worst": [
                { "foodName": "料理名", "date": "M/D", "calories": 数値, "reason": "叱るコメント💦" },
                { "foodName": "料理名", "date": "M/D", "calories": 数値, "reason": "叱るコメント💦" },
                { "foodName": "料理名", "date": "M/D", "calories": 数値, "reason": "叱るコメント💦" }
            ]
        }
    `;

    let lastError = null;
    const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];

    for (const modelName of models) {
        try {
            console.log(`[MealRanking] Trying model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().replace(/```json\n?|\n?```/g, "").trim();

            console.log(`[MealRanking] ${modelName} raw response:`, text.substring(0, 300));

            const jsonMatch = text.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                parsed.model = modelName;
                console.log(`[MealRanking] Success with ${modelName}:`, parsed);
                return parsed;
            }
        } catch (e) {
            console.warn(`[MealRanking] Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }
    return { error: `ランキング生成に失敗しました。(${lastError?.message})` };
};

export const evaluateMealCategory = async (category, meals, dailyContext = {}) => {
    if (!apiKey) return { error: "API Key missing" };
    const genAI = new GoogleGenerativeAI(apiKey);

    const mealTypeLabels = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' };
    const categoryLabel = mealTypeLabels[category] || '食事';

    const totalCalories = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const totalMacronutrients = meals.reduce((acc, m) => ({
        protein: acc.protein + (m.macros?.protein || 0),
        fat: acc.fat + (m.macros?.fat || 0),
        carbs: acc.carbs + (m.macros?.carbs || 0)
    }), { protein: 0, fat: 0, carbs: 0 });

    const prompt = `
      # Role
      あなたはプロの栄養指導者「エレナ」です。
      ユーザーが摂取した「${categoryLabel}」単体を、その食事の構成のみに基づいて評価してください。
      
      【評価対象の${categoryLabel}メニュー】
      ${meals.map(m => `- ${m.foodName} (${m.calories}kcal, P:${m.macros?.protein || 0}g, F:${m.macros?.fat || 0}g, C:${m.macros?.carbs || 0}g)`).join('\n')}
      
      合計: ${totalCalories}kcal
      (P:${totalMacronutrients.protein.toFixed(1)}g, F:${totalMacronutrients.fat.toFixed(1)}g, C:${totalMacronutrients.carbs.toFixed(1)}g)
      
      【コンテキスト（参考）】
      - 1日の目標: ${dailyContext.targetCalories || '不明'} kcal (参考値)
      ※このコンテキストはあくまで「カロリーの余裕」を見るためのものであり、評価の主軸は「その食事自体の質」に置いてください。
      
      【重要な指示】
      1. **1日全体の評価は記述しないでください（厳禁）。** 「1日を通して...」「今日はまだ...」といった発言は一切禁止です。
      2. **${categoryLabel}の内容だけ** を見て、バランスが良いか悪いかを判定してください。
      3. **コメントは50文字以内で短く** してください。長々とした挨拶は不要です。

      【評価基準 (0-10点)】
      - **10点**: 完璧。「完璧な朝食/昼食/夕食です！バランス最高✨」
      - **7-9点**: 良い。「良い組み合わせですね！これならバッチリです👍」
      - **4-6点**: 普通。「悪くないですが、少し炭水化物が多いかも？🤔」
      - **1-3点**: 悪い。「この食事単体で見ると、脂質が高すぎます💦」
      - **0点**: 論外。「これだけでは栄養不足です🙅‍♀️」

      出力形式 (JSONのみ):
      {
        "score": 数値(0-10),
        "comment": "50文字以内の短いコメント（エレナの会話調・絵文字付き）。その食事の良し悪しだけを述べること。",
        "advice": "${categoryLabel}単体への具体的な修正案（例: 「サラダを足すと完璧でした」「ご飯を少し減らしましょう」）",
        "reasoning": "採点の根拠"
      }
    `;

    const MODELS = ["gemini-1.5-pro", "gemini-2.0-flash", "gemini-1.5-flash"];
    let lastError = null;

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.warn(`Category Eval Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: "Failed to evaluate category", details: lastError?.message };
};
