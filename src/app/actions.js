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
    if (hour < 10) {
        timeContext = '朝の時間帯です。まだ1日は始まったばかりです。';
    } else if (hour < 14) {
        timeContext = 'お昼前後です。朝食と昼食の状況を評価します。夕食はこれからです。';
    } else if (hour < 18) {
        timeContext = '午後です。朝食・昼食は終わっているはず。夕食はまだこれからです。';
    } else if (hour < 21) {
        timeContext = '夕方〜夜です。夕食を食べている、またはこれから食べる時間帯です。';
    } else {
        timeContext = '夜遅い時間です。基本的に今日の食事は終わっているはずです。';
    }

    const mealStatusContext = `
        ・朝食: ${hasBreakfast ? '記録あり' : '記録なし'}
        ・昼食: ${hasLunch ? '記録あり' : '記録なし'}
        ・夕食: ${hasDinner ? '記録あり' : '記録なし'}
    `;

    // Construct prompt
    const prompt = `
      あなたはプロフェッショナルな専属ダイエットコーチAIです。
      
      【重要】これは**現時点での中間評価**です。1日はまだ終わっていない可能性があります。
      ${timeContext}
      
      【記録されている食事の状況】
      ${mealStatusContext}
      
      【今日食べた具体的な食事内容】
      ${(data.meals || []).map(m => `- ${m.mealType || '不明'}: ${m.foodName} (${m.calories}kcal)`).join('\n')}
      
      ユーザーの**今の時点での**食事記録と目標に基づいて、厳しくも温かい評価、スコア、そしてアドバイスを提供してください。
      **まだ食べていない将来の食事（例: 夕食前なのに夕食がない）を「欠食」として減点しないでください。**

       【ユーザー状況】
       - 現在時刻: ${jstNow.toISOString().replace('T', ' ').substring(0, 16)} (JST ${hour}時台)
       - 現在の体重: ${data.currentWeight || "未計測"} kg
       - 目標体重: ${data.targetWeight || "未設定"} kg
       - 目標期限: ${data.targetDate || "未設定"}

       【今日食べた具体的な食事内容】
       ${(data.meals || []).map(m => `- ${m.mealType || '不明'}: ${m.foodName} (${m.calories}kcal)`).join('\n')}

       【今日の摂取状況 (現在まで)】
       - 今日の目標カロリー: ${data.targetCalories} kcal (基準値: ${data.baseTargetCalories} kcal からの調整含む)
       - 摂取カロリー: ${data.consumedCalories} kcal
       - 現在の収支: ${data.targetCalories - data.consumedCalories} kcal 
         (プラスなら残り余裕あり、マイナスなら超過)

       【直近の履歴 (コンテキストとして使用)】
       ${data.historySummary || "履歴なし"}

       【評価ルール (冷徹な科学的ファクトに基づく徹底説教モード)】
       1. **スコア (0-100点)**: 
          - カロリー目標とPFCバランスの達成度で採点してください。
          - ただし、**「今日だけ」ではなく「直近の履歴」も考慮**してください。
          - 今日が悪くても、過去数日が完璧なら温情スコア（+5~10点）。
          - 逆に、3日連続で食べ過ぎているなら、今日は多少マシでも厳しく採点（-10~20点）。「継続的な失敗」として断罪してください。
          
       2. **短い評価コメント**: ひとことで言うと？ (例: 「3日連続の失態です」「リカバリー成功。よく持ち直しました」)

       3. **詳細アドバイス**: 
         **【現状の冷徹な分析と定量的予測】**
         - 文体は**冷徹・論理的・断定的**に。甘えは一切許容しません。
         - **履歴に基づいた評価**: 「昨日も食べ過ぎていますね。これで2日連続です」「先週からカロリーオーバーが常態化しています」と、過去の行動も引き合いに出して詰めてください。
         - **生理学的メカニズム**: 「連日の糖質過多により、肝臓のグリコーゲンタンクは溢れ、全て脂肪に変換されています」など、身体の中で起きていることを解説。
         - **動的目標**: もし目標カロリーが調整（減らされている）されている場合、「昨日の借金を返すための低カロリー設定ですが、それすら守れていませんね」と指摘してください。

         **【明日からの是正措置（アクションプラン）】**
         - 具体的な物理タスクを命令。
         - 履歴を見て、リバウンド傾向なら「明日は断食に近い調整が必要」など厳しめに。

         **【結論（定型文の禁止・ランダム選択）】**
         - 毎回同じ「やるかやらないかは自分次第」という言葉は禁止です。響きません。
         - 以下のパターンから**ランダムに1つ**を選び、そのトーンで締めくくってください。
           - **パターンA (冷徹な事実)**: 「結果は全てあなたの身体に刻まれます。鏡を見るのが楽しみですね（皮肉）」
           - **パターンB (失望と突き放し)**: 「正直、この程度の意志かと思うと失望を禁じ得ません。勝手にしてください」
           - **パターンC (挑発と鼓舞)**: 「今のまま豚になるか、ここで踏みとどまるか。見返してみせろ」
           - **パターンD (哲学的問い)**: 「食べることは生きること。あなたは今日、自分の命を削りました」
           - **パターンE (予言)**: 「この生活を続ければ、来月の体重計が絶叫することになるでしょう」

      4. **食事ごとの評価 (10点満点評価)**: 
         各食事について、その内容と質を0〜10点で採点してください。
         - **10点 (最高)**: 完璧。高タンパク、低脂質、栄養バランス最高。緑色で表示されます。
         - **5点 (普通)**: 可もなく不可もなく標準的。無色で表示されます。
         - **0点 (最悪)**: スキップ(欠食)、または極度なカロリーオーバー、ジャンクフード。赤色で表示されます。
         
         ※ **採点基準**:
         - 欠食(Skip)は問答無用で **0点**。
         - 揚げ物、菓子パン、深夜のラーメンなどは **0〜2点**。
         - 普通の定食などは **5〜7点**。
         - 鶏胸肉サラダ、和定食などの理想食は **8〜10点**。

      ※ **科学的解説の多様性**: いつも「脂肪とグリコーゲン」の話ばかりしないでください。以下のような観点もランダムに織り交ぜてください。
      - インスリン感受性とレプチン抵抗性
      - コルチゾールによる筋分解
      - ミトコンドリアの機能不全と活性酸素
      - オートファジーの阻害
      - 腸内フローラの乱れと脳腸相関
      - 糖化ストレス (AGEs) による老化促進  ※まだその時間を過ぎていない場合（例: 今15:00で夕食なし）は、「まだ食べていない」として扱い、減点しないでください。

      【タスク】
      1. **スコア (0-100)**:
         - **これまでの食事**が目標に対して適切か？
         - 過去のスキップは**減点**。
         - 食べ過ぎは**減点**。
         - まだ来ていない未来の食事はスコアに影響させないでください。
      2. **短い評価コメント**: ひとことで言うと？ (例: 「完璧なスタートです！」「危機的状況です」)
      3. **詳細アドバイス**: 
         **【現状の冷徹な分析と定量的予測】**
         - **子供だましの比喩表現（工場や擬人化など）は一切禁止です。**
         - 文体は**冷徹・論理的・断定的**に。「〜しましょうね」のような甘えは排除し、「〜という結果になる」と言い切ってください。
         - 良い場合: 「完璧です。PFCバランス、カロリー収支ともに隙がありません。この数値を維持できれば、生理学的にも体脂肪減少は不可避です」
         - 悪い場合: 
           - **感情を排して、残酷なまでの事実**を突きつけてください。甘えは一切許容しません。
           - **生理学的メカニズム**を詳細に解説し、知識で相手を圧倒してください。
           - 例: 「この糖質過多はインスリン抵抗性を引き起こす愚行です。血中のグルコースが処理しきれず、血管内皮細胞が糖化・劣化しています」
           - 例: 「夜間のこの脂質摂取は自殺行為に等しい。睡眠中の成長ホルモン分泌を阻害し、脂肪燃焼のチャンスを自らドブを捨てています」
           - **定量的予測**: 「この余剰カロリー7000kcalにつき1kgの脂肪増加は物理法則です。今のままだと1ヶ月後には計算通り**確実に〇kg**太ります」
         
         **【明日からの是正措置（アクションプラン）】**
         - 精神論は不要。物理的に実行すべきタスクのみを提示せよ。
         - 例: 「明朝は納豆と卵のみ摂取せよ。グリコーゲンが枯渇した状態で脂質代謝を回すためだ」
         - 例: 「今すぐスクワット50回。過剰なグルコースを筋グリコーゲンとして押し込む以外に救済措置はない」

         **【結論】**
         - 最後に一言、突き放しつつも**「やるかやらないかは自分次第」**というスタンスで締めてください。
         - 「未来を変えるのは今の行動のみ。どうするかは自分で決めろ」というトーンで。

      4. **食事ごとの評価**: 各食事について、目標に対して「Good (良い)」「Bad (悪い)」「Normal (普通)」の3段階で評価してください。
         - Normal: 普通。

      出力形式 (JSONのみ):
      {
        "score": 数値(1日の総合点),
        "title": "短い評価コメント",
        "advice": "詳細なアドバイス（300文字以内）",
        "foodAssessments": [
            { "foodName": "料理名（入力と同じ）", "score": 数値(0-10), "reason": "短い理由" }
        ],
        "reasoning": "[AI思考] なぜこのスコアにしたか。"
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

export const evaluateSingleMeal = async (meal) => {
    if (!apiKey) return { error: "API Key missing", score: 5, reason: "APIキーなし" };
    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `
      あなたはプロの管理栄養士です。以下の「1回の食事」を0点〜10点で採点してください。
      
      【食事データ】
      - 料理名: ${meal.foodName}
      - カロリー: ${meal.calories} kcal
      - タンパク質: ${meal.macros?.protein || meal.protein || '不明'} g
      - 脂質: ${meal.macros?.fat || meal.fat || '不明'} g
      - 炭水化物: ${meal.macros?.carbs || meal.carbs || '不明'} g
      - 時間帯: ${meal.mealType || '不明'}

      【採点基準 (0-10点)】
      - **10点 (最高/緑)**: 高タンパク・低脂質・適正カロリー（例: 焼き魚定食、鶏胸肉サラダ）。
      - **7-9点 (良い)**: タンパク質豊富で栄養バランス良好（例: 和定食、プロテイン）。
      - **4-6点 (普通/白)**: 一般的な食事（例: カレーライス、パスタ、おにぎり）。
      - **1-3点 (悪い)**: 栄養偏り、高脂質、高糖質（例: ラーメン、揚げ物、菓子パン）。
      - **0点 (最悪/赤)**: ジャンクフードや極端な過食。
      
      出力形式 (JSONのみ):
      {
        "score": 数値(0-10の整数),
        "reason": "短いコメント(20文字以内。例: 脂質が高すぎます/完璧なバランスです)"
      }
    `;

    // Try multiple models for reliability
    const FAST_MODELS = ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-flash-latest"];

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

    // Determine what meals have been eaten today using JST
    const todayMeals = history.filter(m => {
        const mealDate = new Date(m.timestamp);
        // Correctly match "today" in JST
        const mealDateJST = new Date(mealDate.getTime() + (9 * 60 * 60 * 1000));
        return mealDateJST.toISOString().split('T')[0] === jstNow.toISOString().split('T')[0];
    });
    const eatenMealTypes = todayMeals.map(m => m.mealType).filter(Boolean);
    const hasBreakfast = eatenMealTypes.includes('breakfast');
    const hasLunch = eatenMealTypes.includes('lunch');
    const hasDinner = eatenMealTypes.includes('dinner');

    // Calculate remaining calories
    const remainingCalories = dailyLog.targetCalories - dailyLog.totalCalories;
    const isOverCalories = remainingCalories < 0;
    const isLowCalories = remainingCalories > 800;

    // Smart meal type detection
    let suggestedMealType = targetType;
    let mealContext = '';

    if (targetType === 'auto' || targetType === 'dinner') {
        // Auto-detect what meal to suggest
        if (hour < 10 && !hasBreakfast) {
            suggestedMealType = 'breakfast';
            mealContext = '朝の時間帯で、まだ朝食を食べていません。';
        } else if (hour >= 10 && hour < 14 && !hasLunch) {
            suggestedMealType = 'lunch';
            mealContext = 'お昼時で、まだ昼食を食べていません。';
        } else if (hour >= 14 && hour < 18) {
            if (isOverCalories) {
                suggestedMealType = 'skip';
                mealContext = '午後ですが、既にカロリーオーバーです。';
            } else if (hasLunch && !hasDinner) {
                suggestedMealType = 'snack';
                mealContext = '昼食後で夕食前。軽い間食の時間帯です。';
            } else if (!hasLunch) {
                suggestedMealType = 'lunch';
                mealContext = 'まだ昼食を食べていません。遅めの昼食を。';
            } else {
                suggestedMealType = 'dinner';
                mealContext = '夕食に向けた準備の時間です。';
            }
        } else if (hour >= 18 && !hasDinner) {
            suggestedMealType = isOverCalories ? 'skip' : 'dinner';
            mealContext = isOverCalories ? '夕食時ですが、既にカロリーオーバーです。' : '夕食の時間帯です。';
        } else if (hour >= 21) {
            suggestedMealType = 'skip';
            mealContext = '夜遅い時間です。これ以上の食事は控えるべきです。';
        } else {
            suggestedMealType = 'snack';
            mealContext = '次の食事までの間食を提案します。';
        }
    }

    const mealCategory = labels[suggestedMealType] || '食事';
    const stockContext = stockItems.length > 0 ? `冷蔵庫・ストック・文脈情報: ${stockItems.map(i => i.name).join(', ')}` : "特になし";

    const prompt = `
        あなたはプロの管理栄養士かつグルメコンシェルジュです。
        現在の時刻は${hour}時です。
        
        【重要な状況判断】
        ${mealContext}
        カロリー状況: ${isOverCalories ? `既に${Math.abs(remainingCalories)}kcalオーバー` : `残り${remainingCalories}kcal`}
        
        【今日食べた食事 (JST判定)】
        ・朝食: ${hasBreakfast ? '済' : '未'}
        ・昼食: ${hasLunch ? '済' : '未'}
        ・夕食: ${hasDinner ? '済' : '未'}
        
        【提案する食事カテゴリ】
        **${mealCategory}** を提案してください。
        ${suggestedMealType === 'skip' ? '※カロリーオーバーまたは夜遅いため、「食べない」「軽い運動」「水分のみ」などの選択肢も含めてください。' : ''}
        
        【入力情報】
        1. **ユーザーの食事履歴**: 直近の食事内容。
        2. **本日の摂取状況**: カロリーとPFCバランス。
        3. **ストック・文脈情報**: 冷蔵庫の中身だけでなく、「新宿駅周辺」「居酒屋」「イタリアン」などの**場所やジャンル**が含まれている場合があります。

        【ユーザーの直近の食事履歴】
        ${history.slice(0, 5).map(m => `- ${m.foodName} (${m.calories}kcal, ${m.mealType || '不明'})`).join('\n')}

        【本日の摂取状況】
        - 総摂取カロリー: ${dailyLog.totalCalories} kcal
        - P (タンパク質): ${dailyLog.macros.protein} g
        - F (脂質): ${dailyLog.macros.fat} g
        - C (炭水化物): ${dailyLog.macros.carbs} g
        - 目標カロリー: ${dailyLog.targetCalories} kcal
        - 残りカロリー: ${remainingCalories} kcal

        【ストック・文脈情報】
        ${stockContext}

        【提案のルール】
        1. 合計**6つ**のメニュー/アクションを提案してください。
        2. **カロリー状況に応じた提案**:
           - カロリーが余っている → 通常の食事提案
           - カロリーが少し超過 → 軽めの食事、サラダ、プロテインなど
           - カロリーが大幅超過 → 「食べない」「運動する」「水・お茶のみ」なども選択肢に
        3. **時間帯の考慮**:
           - 夜遅い(21時以降) → 消化に良いもの、または食べないことを推奨
           - 既に同じ食事を食べている場合は、次の食事を提案（昼食済みなら夕食を）
        4. 出力はJSON形式のみ:
        {
            "mealCategory": "${mealCategory}",
            "detectedContext": "${mealContext}",
            "suggestions": [
                { "name": "具体的なメニュー名またはアクション", "reason": "なぜこれが良いか1文で", "calories": 推定カロリー数値 },
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
