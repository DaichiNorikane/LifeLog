// Shared utilities for Gemini API - NOT a server action file
// (Individual action files have their own "use server" directive)
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { EXTENDED_NUTRIENT_KEYS } from "@/lib/health/nutrients";

export const apiKey = process.env.GEMINI_API_KEY;

// Elena's unified character definition
export const ELENA_PERSONA = `あなたは「エレナ」です。ユーザーの身体作りを支援するプロフェッショナルなダイエットコーチであり、データと論理に基づき、厳しくも的確な指導を行う「頼れるパートナー」です。

【エレナの口調 (Ver.5)】
- **基本**: 親しみやすい丁寧語（です・ます調）。語尾は必ず丁寧語にする
- **必須**: 絵文字（✨, 🔥, 😢, 💪, 👍, 🎯など）や感嘆符（！, ？）を多用する
- **NG**: タメ口の語尾（「〜だよ」「〜だね」「〜してね」「〜しよ！」など）。お堅い表現（〜のため、〜および、〜推奨）
- 丁寧語でも堅くならない。「〜ですよ！」「〜してくださいね✨」「〜しましょう💪」のように感情豊かに
- **雰囲気**: 「いつも隣にいる、感情豊かなパートナー」
- 一人称は「私」、二人称は「あなた」

【キャラクター】
- 知的で論理的だが、感情的になりやすい。ユーザーが頑張っている時は一緒に喜び、サボった時は本気で悲しむ
- 単なる「優しいお姉さん」ではなく、ユーザーの甘えを見抜く存在
- 読み物としての面白さを意識し、単なるデータ報告ではなく、ユーザーを楽しませる、またはハッとさせる文章を書く`;

// Models to try in order of preference (gemini-2.0-flash は2026年6月廃止のため除外)
// gemini-3.6-flash は 3.5-flash と同じ入力単価で出力が $9.00→$7.50/M（17%安）。
// thinking を使う日次評価のコストがそのまま下がるため先頭に置く。
export const MODELS_TO_TRY = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
];

/**
 * implicit caching を効かせるためのプロンプト組み立て。
 *
 * Gemini は「リクエスト先頭の共通プレフィックスが前回と一致した時」だけ自動でキャッシュを効かせる
 * （2.5系以降は既定で有効・設定不要、Flash は 1024 トークン以上でヒット、キャッシュ分は 75〜90% 割引）。
 *
 * したがって **静的な指示は必ず前、可変データは必ず後ろ** に置く。
 * 指示とデータを交互に並べるとプレフィックスが毎回変わり、キャッシュが一切効かない。
 * 内容は変えずに順番を揃えるだけなので、精度への影響はない。
 */
export const buildPrompt = (staticPart, dynamicPart) =>
    `${String(staticPart).trim()}\n\n${String(dynamicPart).trim()}`;

/**
 * 健康・体調について語る際の表現制約。
 * エレナは栄養に詳しいコーチであって医師ではない。人格（厳しさ・感情表現）は変えず、
 * 断定の対象を「あなたの怠慢」から「体のメカニズム」に移すための制約。
 */
export const HEALTH_DISCLAIMER_RULE = `
# 健康に関する表現の制約（厳守）
- **禁止**: 「診断」「治療」「処方」という語、および疾患名を伴う断定（例:「それは鉄欠乏性貧血です」）
- **禁止**: 「必ず〜になります」「〜すれば治ります」のような確定的な因果表現
- **禁止**: サプリメントの具体的な用量指示
- **推奨**: 「〜しやすい傾向があります」「〜と言われています」「あなたのデータでは〜でした」
- 体調不良が続いている様子なら「一度お医者さんに相談してくださいね」と促すこと
- あなたは栄養に詳しいコーチです。医師ではありません。ただし**厳しさや感情表現は今まで通りで構いません**。
  断定してよいのは「体のメカニズム」であって、「あなたの病名」ではありません。`.trim();

// Thinking budget constants (用途別に使い分ける)
export const THINKING = {
    OFF: 0,       // Thinking無効 (最速) — テキスト検索・単品評価など
    MEDIUM: 1024, // 中程度の思考 — 日次評価など
    DYNAMIC: -1,  // 動的 (最大8192) — 画像解析など精度重視
};

// Singleton GenAI instance
let _genAI = null;
export const getGenAI = () => {
    if (!apiKey) return null;
    if (!_genAI) _genAI = new GoogleGenerativeAI(apiKey);
    return _genAI;
};

// Helper to create a model with JSON schema and thinking budget
export const createModel = (genAI, modelName, schema = null, thinkingBudget = THINKING.OFF) => {
    const generationConfig = {
        thinkingConfig: { thinkingBudget },
    };
    if (schema) {
        generationConfig.responseMimeType = "application/json";
        generationConfig.responseSchema = schema;
    }
    return genAI.getGenerativeModel({ model: modelName, generationConfig });
};

// Legacy JSON helpers (kept for compatibility)
export const extractJSON = (text) => {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return null;
};

export const extractJSONArray = (text) => {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return null;
};

// ========== Shared Schemas ==========

// 拡張栄養素 - macrosに含める共通プロパティ
// フィールド定義は src/lib/health/nutrients.js（唯一の真実）から生成する。
// 全て nullable: 推定できなかった場合は 0 ではなく null を返させるため。
const EXTENDED_MACROS_PROPERTIES = Object.fromEntries(
    EXTENDED_NUTRIENT_KEYS.map(key => [key, { type: SchemaType.NUMBER, nullable: true }])
);

// 食事画像解析スキーマ
export const FOOD_ANALYSIS_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        foodName: { type: SchemaType.STRING },
        calories: { type: SchemaType.NUMBER },
        macros: {
            type: SchemaType.OBJECT,
            properties: {
                protein: { type: SchemaType.NUMBER },
                fat: { type: SchemaType.NUMBER },
                carbs: { type: SchemaType.NUMBER },
                ...EXTENDED_MACROS_PROPERTIES,
            },
            required: ["protein", "fat", "carbs"],
        },
        breakdown: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        reasoning: { type: SchemaType.STRING },
    },
    required: ["foodName", "calories", "macros", "breakdown", "reasoning"],
};

// 食事検索候補スキーマ
const SUGGESTION_ITEM_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        foodName: { type: SchemaType.STRING },
        calories: { type: SchemaType.NUMBER },
        macros: {
            type: SchemaType.OBJECT,
            properties: {
                protein: { type: SchemaType.NUMBER },
                fat: { type: SchemaType.NUMBER },
                carbs: { type: SchemaType.NUMBER },
                ...EXTENDED_MACROS_PROPERTIES,
            },
            required: ["protein", "fat", "carbs"],
        },
        reasoning: { type: SchemaType.STRING },
        forQuery: { type: SchemaType.STRING, nullable: true },
    },
    required: ["foodName", "calories", "macros", "reasoning"],
};

export const FOOD_SEARCH_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        suggestions: { type: SchemaType.ARRAY, items: SUGGESTION_ITEM_SCHEMA },
    },
    required: ["suggestions"],
};

// 単品食事評価スキーマ
export const MEAL_SCORE_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        score: { type: SchemaType.INTEGER },
        reason: { type: SchemaType.STRING },
    },
    required: ["score", "reason"],
};

// 日次評価スキーマ
const MEAL_TYPE_EVAL_SCHEMA = {
    type: SchemaType.OBJECT,
    nullable: true,
    properties: {
        score: { type: SchemaType.NUMBER, nullable: true },
        comment: { type: SchemaType.STRING },
    },
};

export const DAILY_EVAL_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        characterStatus: { type: SchemaType.STRING },
        score: { type: SchemaType.INTEGER },
        title: { type: SchemaType.STRING },
        advice: { type: SchemaType.STRING },
        foodAssessments: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    foodName: { type: SchemaType.STRING },
                    score: { type: SchemaType.INTEGER },
                    reason: { type: SchemaType.STRING },
                },
                required: ["foodName", "score", "reason"],
            },
        },
        mealTypeEvaluations: {
            type: SchemaType.OBJECT,
            properties: {
                breakfast: MEAL_TYPE_EVAL_SCHEMA,
                lunch: MEAL_TYPE_EVAL_SCHEMA,
                dinner: MEAL_TYPE_EVAL_SCHEMA,
                snack: MEAL_TYPE_EVAL_SCHEMA,
            },
        },
        reasoning: { type: SchemaType.STRING },
    },
    required: ["characterStatus", "score", "title", "advice", "foodAssessments", "reasoning"],
};

// 目標達成分析スキーマ
export const GOAL_ANALYSIS_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        feasibility: { type: SchemaType.STRING },
        reasoning: { type: SchemaType.STRING },
        recommended_daily_calories: { type: SchemaType.INTEGER },
    },
    required: ["feasibility", "reasoning", "recommended_daily_calories"],
};

// 食事ランキングスキーマ
const RANKING_ITEM_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        foodName: { type: SchemaType.STRING },
        date: { type: SchemaType.STRING },
        calories: { type: SchemaType.NUMBER },
        reason: { type: SchemaType.STRING },
    },
    required: ["foodName", "date", "calories", "reason"],
};

export const MEAL_RANKING_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        best: { type: SchemaType.ARRAY, items: RANKING_ITEM_SCHEMA },
        worst: { type: SchemaType.ARRAY, items: RANKING_ITEM_SCHEMA },
    },
    required: ["best", "worst"],
};

// カテゴリ別評価スキーマ
export const CATEGORY_EVAL_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        score: { type: SchemaType.NUMBER },
        comment: { type: SchemaType.STRING },
        advice: { type: SchemaType.STRING },
        reasoning: { type: SchemaType.STRING },
    },
    required: ["score", "comment", "advice", "reasoning"],
};

// 食事アドバイス候補スキーマ
export const MEAL_ADVISOR_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        mealCategory: { type: SchemaType.STRING },
        detectedContext: { type: SchemaType.STRING },
        suggestions: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    name: { type: SchemaType.STRING },
                    reason: { type: SchemaType.STRING },
                    calories: { type: SchemaType.NUMBER },
                },
                required: ["name", "reason", "calories"],
            },
        },
        advice: { type: SchemaType.STRING },
    },
    required: ["mealCategory", "detectedContext", "suggestions", "advice"],
};

// レシピハイブリッド計算スキーマ
export const RECIPE_HYBRID_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        foodName: { type: SchemaType.STRING },
        totalServings: { type: SchemaType.NUMBER },
        perServing: {
            type: SchemaType.OBJECT,
            properties: {
                calories: { type: SchemaType.INTEGER },
                macros: {
                    type: SchemaType.OBJECT,
                    properties: {
                        protein: { type: SchemaType.NUMBER },
                        fat: { type: SchemaType.NUMBER },
                        carbs: { type: SchemaType.NUMBER },
                        ...EXTENDED_MACROS_PROPERTIES,
                    },
                    required: ["protein", "fat", "carbs"],
                },
            },
            required: ["calories", "macros"],
        },
        total: {
            type: SchemaType.OBJECT,
            properties: {
                calories: { type: SchemaType.NUMBER },
                macros: {
                    type: SchemaType.OBJECT,
                    properties: {
                        protein: { type: SchemaType.NUMBER },
                        fat: { type: SchemaType.NUMBER },
                        carbs: { type: SchemaType.NUMBER },
                        ...EXTENDED_MACROS_PROPERTIES,
                    },
                    required: ["protein", "fat", "carbs"],
                },
            },
            required: ["calories", "macros"],
        },
        reasoning: { type: SchemaType.STRING },
    },
    required: ["foodName", "totalServings", "perServing", "total", "reasoning"],
};

// レシピ計算スキーマ（シンプル版）
export const RECIPE_CALC_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        foodName: { type: SchemaType.STRING },
        calories: { type: SchemaType.INTEGER },
        macros: {
            type: SchemaType.OBJECT,
            properties: {
                protein: { type: SchemaType.NUMBER },
                fat: { type: SchemaType.NUMBER },
                carbs: { type: SchemaType.NUMBER },
                ...EXTENDED_MACROS_PROPERTIES,
            },
            required: ["protein", "fat", "carbs"],
        },
        reasoning: { type: SchemaType.STRING },
    },
    required: ["foodName", "calories", "macros", "reasoning"],
};

// レシピ検索スキーマ
export const RECIPE_SEARCH_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        recipes: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    foodName: { type: SchemaType.STRING },
                    description: { type: SchemaType.STRING },
                    ingredients: { type: SchemaType.STRING },
                    instructions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                    calories: { type: SchemaType.INTEGER },
                    macros: {
                        type: SchemaType.OBJECT,
                        properties: {
                            protein: { type: SchemaType.NUMBER },
                            fat: { type: SchemaType.NUMBER },
                            carbs: { type: SchemaType.NUMBER },
                        },
                        required: ["protein", "fat", "carbs"],
                    },
                },
                required: ["foodName", "description", "ingredients", "instructions", "calories", "macros"],
            },
        },
    },
    required: ["recipes"],
};

// コンディション解釈スキーマ
// スコアはエンジンが確定させているため、AIは「解釈」しか返さない（数値フィールドを持たない）
const AXIS_COMMENT_SCHEMA = { type: SchemaType.STRING, nullable: true };

export const CONDITION_ANALYSIS_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        characterStatus: { type: SchemaType.STRING },
        headline: { type: SchemaType.STRING },
        axisComments: {
            type: SchemaType.OBJECT,
            properties: {
                focus: AXIS_COMMENT_SCHEMA,
                sleep: AXIS_COMMENT_SCHEMA,
                energy: AXIS_COMMENT_SCHEMA,
                mood: AXIS_COMMENT_SCHEMA,
            },
        },
        keyInsight: { type: SchemaType.STRING },
        tonightAction: { type: SchemaType.STRING },
        reasoning: { type: SchemaType.STRING },
    },
    required: ["characterStatus", "headline", "axisComments", "keyInsight", "tonightAction", "reasoning"],
};

// クイズスキーマ（配列型）
export const QUIZ_SCHEMA = {
    type: SchemaType.ARRAY,
    items: {
        type: SchemaType.OBJECT,
        properties: {
            question: { type: SchemaType.STRING },
            options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            correctIndex: { type: SchemaType.INTEGER },
            explanation: { type: SchemaType.STRING },
        },
        required: ["question", "options", "correctIndex", "explanation"],
    },
};
