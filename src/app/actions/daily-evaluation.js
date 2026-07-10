"use server";
import {
    apiKey, getGenAI, ELENA_PERSONA, MODELS_TO_TRY, THINKING, createModel,
    DAILY_EVAL_SCHEMA, MEAL_SCORE_SCHEMA, GOAL_ANALYSIS_SCHEMA,
    MEAL_RANKING_SCHEMA, CATEGORY_EVAL_SCHEMA
} from "./gemini-client";
import { suggestNextMeal } from "./meal-advisor";

export const evaluateDailyLog = async (data, stockItems = []) => {
    if (!apiKey) {
        return { error: "API Key missing" };
    }

    // Call Advisor Internally
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

    const genAI = getGenAI();

    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const hour = jstNow.getUTCHours();

    const loggedMealTypes = (data.meals || []).map(m => m.mealType).filter(Boolean);
    const hasBreakfast = loggedMealTypes.includes('breakfast');
    const hasLunch = loggedMealTypes.includes('lunch');
    const hasDinner = loggedMealTypes.includes('dinner');

    let timeContext = '';
    let expectedCalorieRatio = 1.0;

    if (hour < 10) {
        timeContext = '朝の時間帯です。まだ1日は始まったばかりです。';
        expectedCalorieRatio = 0.25;
    } else if (hour < 14) {
        timeContext = 'お昼前後です。朝食と昼食の状況を評価します。夕食はこれからです。';
        expectedCalorieRatio = 0.50;
    } else if (hour < 18) {
        timeContext = '午後です。朝食・昼食は終わっているはず。夕食はまだこれからです。';
        expectedCalorieRatio = 0.60;
    } else if (hour < 21) {
        timeContext = '夕方〜夜です。夕食を食べている、またはこれから食べる時間帯です。';
        expectedCalorieRatio = 0.85;
    } else {
        timeContext = '夜遅い時間です。基本的に今日の食事は終わっているはずです。';
        expectedCalorieRatio = 1.0;
    }

    const expectedCalories = Math.round(data.targetCalories * expectedCalorieRatio);
    const isOnTrack = data.consumedCalories >= expectedCalories * 0.7;
    const isSlightlyLow = data.consumedCalories >= expectedCalories * 0.5 && data.consumedCalories < expectedCalories * 0.7;
    const isVeryLow = data.consumedCalories < expectedCalories * 0.5;

    let calorieEvaluation = '';
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

    const avgCal3Days = data.avgCal3Days || 0;
    const streakDays = data.streakDays || 0;
    const targetWeightDiff = (data.currentWeight && data.targetWeight) ? (data.currentWeight - data.targetWeight).toFixed(1) : "不明";

    const prompt = `
# Role
${ELENA_PERSONA}

【重要】これは**現時点での中間評価**です。
${timeContext}
${isVeryLow && (hasDinner || hour >= 21) ? "【緊急】カロリーが極端に足りていません！「今日は終わり」にせず、追加で何か食べるよう強く促してください。" : ""}

# Icon Status Table (表情管理)
回答の characterStatus フィールドに、以下の【ステータスコード】を必ず1つ出力してください。
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
- この時間帯までの期待カロリー: 約${expectedCalories}kcal (1日目標${Math.floor(data.targetCalories)}kcalの${Math.round(expectedCalorieRatio * 100)}%)
- 現在の摂取: ${Math.floor(data.consumedCalories)}kcal
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
- 今日の目標カロリー: ${Math.floor(data.targetCalories)} kcal
- 摂取カロリー: ${Math.floor(data.consumedCalories)} kcal
- 現在の収支: ${Math.floor(data.targetCalories - data.consumedCalories)} kcal
  (プラスなら残り余裕あり、マイナスなら超過)

【直近の履歴 (コンテキストとして使用)】
${data.historySummary || "履歴なし"}

【出力フィールドの仕様】
- characterStatus: "[STATUS: ステータス名]" の形式
- score: 0-100の整数（日の総合点）
- title: 短い評価コメント（会話調・絵文字あり）
- advice: Markdownの太字を使って以下の見出しを含めること → **【ステータス】** **【Good】** **【Bad】** **【Action】** **【豆知識】** **【結論】**
- foodAssessments: 各食事を0-10点で評価（以下の基準）
  - 10点: 完璧。「完璧です！美味しそう〜✨」
  - 7-9点: 良い。「イイ感じですね！👍」
  - 4-6点: 普通。「ん〜、まあまあですかね？🤔」
  - 1-3点: 悪い。「えっ...これはちょっと...💦」
  - 0点: 最悪。「嘘でしょう！？これはダメです！！😱」
- mealTypeEvaluations: 朝食・昼食・夕食・間食の区分別評価（記録なしは null）
- reasoning: AIの採点根拠
    `.trim();

    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = createModel(genAI, modelName, DAILY_EVAL_SCHEMA, THINKING.MEDIUM);
            const result = await model.generateContent(prompt);
            const resultData = JSON.parse(result.response.text());
            resultData.model = modelName;

            if (adviceResult) {
                resultData.suggestions = adviceResult.suggestions;
                resultData.mealCategory = adviceResult.mealCategory;
                resultData.detectedContext = adviceResult.detectedContext;
            }
            return resultData;
        } catch (e) {
            console.warn(`Evaluation Model ${modelName} failed:`, e.message);
        }
    }

    return { error: "Failed to evaluate log" };
};

export const evaluateSingleMeal = async (meal, contextMeals = [], options = {}) => {
    if (!apiKey) return { error: "API Key missing", score: 5, reason: "APIキーなし" };
    const genAI = getGenAI();

    // LINE経由の場合は直近の会話履歴を渡し、チャットの流れと矛盾しないコメントにする
    const messageHistory = Array.isArray(options.messageHistory) ? options.messageHistory : [];
    const historyInfo = messageHistory.length
        ? `
【直近のLINE会話履歴（古い順）】
${messageHistory.map(m => `${m.role === 'assistant' ? 'エレナ' : 'ユーザー'}: ${m.text}`).join('\n')}

**会話ルール**: 上の会話の流れを必ず踏まえてコメントしてください。
- 事前にユーザーが「食べたいもの」を相談していて、あなたが条件付きでOKを出していた場合、その提案に沿った選択なら「約束通りにできたこと」をまず褒めてください。頭ごなしに叱るのは禁止です。
- 会話と関係ない食事なら、通常通り評価してください。`
        : '';

    const otherMealsInSameMeal = contextMeals.filter(m =>
        m.id !== meal.id && m.mealType === meal.mealType
    );

    const mealTypeLabels = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' };
    const mealTypeLabel = mealTypeLabels[meal.mealType] || '食事';

    let contextInfo = '';
    if (otherMealsInSameMeal.length > 0) {
        const totalCalsInMeal = otherMealsInSameMeal.reduce((sum, m) => sum + (m.calories || 0), 0) + meal.calories;
        const otherFoods = otherMealsInSameMeal.map(m => `${m.foodName}（${m.calories}kcal）`).join('、');
        contextInfo = `
【重要: この${mealTypeLabel}の全体構成】
この${mealTypeLabel}には、評価対象の「${meal.foodName}」以外にも以下が含まれています:
- ${otherFoods}
- ${mealTypeLabel}トータル: 約${Math.round(totalCalsInMeal)}kcal

**評価ルール**: 「${meal.foodName}」単独では栄養が偏って見えても、${mealTypeLabel}全体として見た時のバランスを考慮してください。`;
    } else {
        contextInfo = `
【この${mealTypeLabel}の構成】
現在、この${mealTypeLabel}には「${meal.foodName}」のみが登録されています。
他の料理が追加されれば評価が変わる可能性があります。`;
    }

    const prompt = `
# Role
${ELENA_PERSONA}
「1回の食事に含まれる1品」を0点〜10点で採点し、エレナとして一言コメントしてください。

【評価対象の料理】
- 料理名: ${meal.foodName}
- カロリー: ${meal.calories} kcal
- PFC: P${meal.macros?.protein || 0}g / F${meal.macros?.fat || 0}g / C${meal.macros?.carbs || 0}g
- 時間帯: ${mealTypeLabel}
${contextInfo}
${historyInfo}

【採点基準 (0-10点)】
- **10点**: 完璧。「完璧です！美味しそう〜✨」
- **7-9点**: 良い。「イイ感じですね！👍 あと少しお野菜があれば...！」
- **4-6点**: 普通。「ん〜、まあまあですかね？🤔 次はもう少し工夫しましょう！」
- **1-3点**: 悪い。「えっ...これはちょっと...💦 脂質高すぎません？🙅‍♀️」
- **0点**: 最悪。「嘘でしょう！？これはダメです！！😱」

score は 0-10 の整数、reason はエレナとしての評価コメント（40文字程度・絵文字付きの会話調）で出力してください。
    `.trim();

    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`[SingleMealEval] Trying model: ${modelName}`);
            const model = createModel(genAI, modelName, MEAL_SCORE_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const parsed = JSON.parse(result.response.text());
            console.log(`[SingleMealEval] Success with ${modelName}:`, parsed);
            return parsed;
        } catch (e) {
            console.warn(`[SingleMealEval] Model ${modelName} failed:`, e.message);
        }
    }

    console.log('[SingleMealEval] All models failed, using heuristic fallback');
    return heuristicScore(meal);
};

const heuristicScore = (meal) => {
    const name = (meal.foodName || '').toLowerCase();
    const calories = meal.calories || 0;
    const protein = meal.macros?.protein || 0;

    if (/ラーメン|カップ麺|唐揚げ|フライ|ポテト|菓子|チョコ|ケーキ|アイス|揚げ/.test(name)) {
        return { score: 2, reason: '高カロリー食' };
    }
    if (/サラダ|鶏胸|ササミ|魚|焼き|蒸し|野菜|プロテイン|納豆|豆腐/.test(name)) {
        return { score: 8, reason: '健康的な食事' };
    }
    if (protein >= 25 && calories < 500) {
        return { score: 7, reason: '高タンパク' };
    }
    if (calories > 1000) {
        return { score: 3, reason: 'カロリー過多' };
    }
    return { score: 5, reason: '普通の食事' };
};

export const analyzeGoalFeasibility = async (data) => {
    if (!apiKey) return { error: "API Key missing" };

    const { currentWeight, targetWeight, targetDate, height, age, gender, recentCalories, streakDays } = data;
    const genAI = getGenAI();

    const daysRemaining = Math.max(0, Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24)));
    const kgToLose = currentWeight - targetWeight;
    const weeksRemaining = Math.max(0.1, daysRemaining / 7);
    const requiredPace = kgToLose / weeksRemaining;

    const prompt = `
${ELENA_PERSONA}

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

feasibility に "Impossible" | "Strict" | "Realistic" | "Easy" のいずれかを設定してください。
reasoning には**250文字以上**で以下を含めること：
- 最初に絵文字付きで声かけ
- 現状の分析（BMI、目標までの減量幅、週あたりのペース）を改行して読みやすく
- 判定結果に応じた感情豊かなコメント
- 推奨カロリーを太字で強調（「1日 **○○kcal** を目安にしましょう！」）
- 最後に励ましの一言と絵文字
- 改行（\\n）を使って段落を分け、読みやすくすること

recommended_daily_calories には目標達成のために推奨される1日の摂取カロリー（整数）を設定してください。
    `.trim();

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`[GoalAnalysis] Trying model: ${modelName}`);
            const model = createModel(genAI, modelName, GOAL_ANALYSIS_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const parsed = JSON.parse(result.response.text());
            parsed.model = modelName;
            console.log(`[GoalAnalysis] Success with model: ${modelName}`);
            return parsed;
        } catch (error) {
            console.warn(`[GoalAnalysis] Model ${modelName} failed:`, error.message);
            lastError = error;
        }
    }

    console.error("Goal Analysis Error: All models failed. Last error:", lastError);
    return { error: `分析に失敗しました。(${lastError?.message || "All models failed"})` };
};

export const generateMealRanking = async (meals) => {
    if (!apiKey) return { error: "API Key missing" };
    const genAI = getGenAI();

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

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

    const summary = recentMeals.slice(0, 50).map(m => {
        const d = new Date(m.timestamp);
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
        const mealTypeLabel = { breakfast: '朝', lunch: '昼', dinner: '夜', snack: '間食' }[m.mealType] || '';
        return `- [${dateStr} ${mealTypeLabel}] ${m.foodName} (${m.calories}kcal, P:${m.macros?.protein || 0}g F:${m.macros?.fat || 0}g C:${m.macros?.carbs || 0}g)`;
    }).join('\n');

    const prompt = `
# Role
${ELENA_PERSONA}
ユーザーの直近2週間の食事記録から、**ベスト3**と**ワースト3**を選出してください。

【食事履歴（最大50件）】
${summary}

【選出基準】
- **ベスト**: PFC（タンパク質・脂質・炭水化物）バランスが良い、カロリー適切、健康的な食材、野菜が多い、自炊など。
- **ワースト**: 脂質過多、カロリーオーバー、栄養偏り（炭水化物のみなど）、ジャンクフード、お酒のみなど。

【出力ルール】
- ベスト3、ワースト3をそれぞれ3件ずつ出力してください。
- 各アイテムには foodName・date（M/D形式）・calories・reason を含めてください。
- reason はエレナの口調で、絵文字付きで褒めるor叱ってください。
- 同じ料理が複数回記録されていても、それぞれ別の日付として扱ってください。
    `.trim();

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`[MealRanking] Trying model: ${modelName}`);
            const model = createModel(genAI, modelName, MEAL_RANKING_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const parsed = JSON.parse(result.response.text());
            parsed.model = modelName;
            console.log(`[MealRanking] Success with ${modelName}`);
            return parsed;
        } catch (e) {
            console.warn(`[MealRanking] Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }
    return { error: `ランキング生成に失敗しました。(${lastError?.message})` };
};

export const evaluateMealCategory = async (category, meals, dailyContext = {}) => {
    if (!apiKey) return { error: "API Key missing" };
    const genAI = getGenAI();

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
${ELENA_PERSONA}
ユーザーが摂取した「${categoryLabel}」単体を、その食事の構成のみに基づいて評価してください。

【評価対象の${categoryLabel}メニュー】
${meals.map(m => `- ${m.foodName} (${m.calories}kcal, P:${m.macros?.protein || 0}g, F:${m.macros?.fat || 0}g, C:${m.macros?.carbs || 0}g)`).join('\n')}

合計: ${totalCalories}kcal
(P:${totalMacronutrients.protein.toFixed(1)}g, F:${totalMacronutrients.fat.toFixed(1)}g, C:${totalMacronutrients.carbs.toFixed(1)}g)

【コンテキスト（参考）】
- 1日の目標: ${dailyContext.targetCalories || '不明'} kcal (参考値)
※このコンテキストはあくまで「カロリーの余裕」を見るためのものであり、評価の主軸は「その食事自体の質」に置いてください。

【重要な指示】
1. **1日全体の評価は記述しないでください（厳禁）。**「1日を通して...」「今日はまだ...」といった発言は一切禁止です。
2. **${categoryLabel}の内容だけ**を見て、バランスが良いか悪いかを判定してください。
3. **comment は50文字以内で短く**してください。

【評価基準 (0-10点)】
- **10点**: 完璧。「完璧な朝食/昼食/夕食です！バランス最高✨」
- **7-9点**: 良い。「良い組み合わせですね！これならバッチリです👍」
- **4-6点**: 普通。「悪くないですが、少し炭水化物が多いかもしれません🤔」
- **1-3点**: 悪い。「この食事単体で見ると、脂質が高すぎます💦」
- **0点**: 論外。「これだけでは栄養不足です🙅‍♀️」

score には 0-10 の数値、comment には50文字以内の短いコメント（エレナの会話調・絵文字付き）、
advice には${categoryLabel}単体への具体的な修正案、reasoning には採点の根拠を出力してください。
    `.trim();

    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = createModel(genAI, modelName, CATEGORY_EVAL_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            return JSON.parse(result.response.text());
        } catch (e) {
            console.warn(`Category Eval Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: "Failed to evaluate category", details: lastError?.message };
};
