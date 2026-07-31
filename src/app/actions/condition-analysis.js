"use server";
import {
    apiKey, getGenAI, ELENA_PERSONA, MODELS_TO_TRY, THINKING, createModel,
    CONDITION_ANALYSIS_SCHEMA, HEALTH_DISCLAIMER_RULE, buildPrompt,
} from "./gemini-client";
import { AXES, AXIS_LABELS, GRADES } from "@/lib/health/conditionRules";

const SCALE_LABELS = ['', '最悪', 'いまいち', 'ふつう', 'よい', '絶好調'];

/**
 * 静的な指示（毎回まったく同じ文字列）。
 * implicit caching はプレフィックス一致でしか効かないため、可変データより必ず前に置く。
 * この定数はモジュール読み込み時に1度だけ組み立てられる。
 */
const STATIC_PROMPT = `
# Role
${ELENA_PERSONA}

あなたはいま、ユーザーの「体調」について語ります。
体重やダイエットの話ではありません。**今日の頭の冴え・今夜の眠り・エネルギー・気分**の話です。

# あなたの仕事（最重要）
スコアは**すでにシステムが確定させています**。あなたの仕事は数値を「解釈」して語ることです。

- **数値を変更・再計算してはいけません。** 与えられた点数をそのまま前提にしてください。
- 与えられていない要因を勝手に作らないでください。挙がっているドライバーだけを根拠にします。
- 「なぜその要因がその軸に効くのか」を、生理学・栄養学のメカニズムとして説明してください。
  ここがあなたの価値です。点数の読み上げではなく、**納得感**を届けてください。

# 語り方
- スコアが低い軸を「あなたの怠慢」として責めないでください。**体の反応**として説明します。
  ✕「またサボりましたね？」→ ○「17時のカフェインが、まだ体に残っているんです」
- スコアが高い軸は全力で褒めてください。
- tonightAction は**1つだけ**。「あれもこれも」は行動に繋がりません。
- スコアが出ていない軸（判定不可）の axisComments は null にしてください。作文で埋めないこと。

${HEALTH_DISCLAIMER_RULE}

# Icon Status Table
characterStatus に以下のいずれかを "[STATUS: 名前]" 形式で出力してください。
- [STATUS: NORMAL] - 通常。淡々としたデータ確認
- [STATUS: SCOLD] - 叱責。明らかに体に悪い選択を繰り返している
- [STATUS: LOGIC] - 論理。メカニズムを解説する（体調の話では最も出番が多い）
- [STATUS: ENCOURAGE] - 激励。努力しているが結果が出ていない
- [STATUS: CHEER] - 称賛。良いコンディションを作れている

# 出力フィールドの仕様
- characterStatus: "[STATUS: ステータス名]" の形式
- headline: 今日のコンディションを一言で（40文字程度・絵文字あり）
- axisComments: 各軸へのコメント（各60文字程度・会話調）。判定不可の軸は null
- keyInsight: 最も効いた要因が**なぜ**その軸に効くのかのメカニズム解説（150文字程度）
- tonightAction: 今夜または明日できる具体的な行動を1つだけ（60文字程度）
- reasoning: どの数値を根拠にどう解釈したか
`.trim();

const formatDrivers = (drivers = []) => {
    if (drivers.length === 0) return '    （特筆すべき要因なし）';
    return drivers
        .map(d => `    ${d.delta > 0 ? '+' : '-'} ${d.label}${d.detail ? `（${d.detail}）` : ''}: ${d.delta > 0 ? '+' : ''}${d.delta}`)
        .join('\n');
};

const formatAxes = (result) => AXES.map((axis) => {
    const data = result.axes?.[axis];
    if (!data || data.score === null || data.score === undefined) {
        return `- ${AXIS_LABELS[axis]}: 判定不可（データ不足。コメントは null にすること）`;
    }
    const grade = GRADES[data.grade]?.label || '';
    const conf = data.confidence === 'low' ? '・参考値' : '';
    return `- ${AXIS_LABELS[axis]}: ${data.score}点（${grade}${conf}）\n${formatDrivers(data.drivers)}`;
}).join('\n');

const formatMeals = (meals = []) => {
    if (meals.length === 0) return '（記録なし）';
    return meals.map((m) => {
        const time = new Date(m.timestamp);
        const hhmm = Number.isNaN(time.getTime())
            ? '--:--'
            : new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(time);
        const typeLabel = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' }[m.mealType] || '';
        return `- ${hhmm} ${typeLabel}: ${m.foodName} (${Math.round(m.calories || 0)}kcal)`;
    }).join('\n');
};

const formatSubjective = (conditionLog) => {
    if (!conditionLog) return '（まだ回答がありません）';
    const lines = [];
    const sleep = conditionLog.sleep?.subjective;
    const focus = conditionLog.focus?.subjective;
    if (sleep) lines.push(`- 本人が答えた昨夜の眠り: ${sleep}/5（${SCALE_LABELS[sleep]}）`);
    if (focus) lines.push(`- 本人が答えた今日の集中力: ${focus}/5（${SCALE_LABELS[focus]}）`);

    const asleep = conditionLog.sleep?.objective?.asleepMinutes;
    if (asleep) lines.push(`- 実測の睡眠時間: 約${Math.round(asleep / 60 * 10) / 10}時間`);

    return lines.length > 0 ? lines.join('\n') : '（まだ回答がありません）';
};

/**
 * エンジンが確定させたスコアを、エレナの言葉に翻訳する。
 *
 * thinking は OFF。二層アーキテクチャの効果がここで出る:
 * 判断（どの要因が何点効くか）はエンジンが終えているので、AIに考えさせる必要がない。
 * 言い換えるだけの仕事に thinking 予算を払うとコストが2倍以上になる。
 *
 * @param {object} engineResult evaluateCondition() の戻り値
 * @param {object} context { meals, conditionLog, findings }
 */
export const analyzeCondition = async (engineResult, context = {}) => {
    if (!apiKey) return { error: "API Key missing" };
    if (!engineResult?.axes) return { error: "コンディションの計算結果がありません" };

    const genAI = getGenAI();

    // パーソナライズ知見（Phase 4 で埋まる。今は空でも動く）
    const findings = Array.isArray(context.findings) ? context.findings : [];
    const findingsBlock = findings.length > 0
        ? `\n【あなたが過去のデータから見つけた、この人だけの傾向】\n${findings.map(f => `- ${f}`).join('\n')}\n※これは相関の観察です。「傾向がありそう」以上の断定はしないでください。`
        : '';

    const dynamicPrompt = `
# Data（ここから下が今日の実データ）

【確定済みのスコア（変更・再計算は禁止）】
${formatAxes(engineResult)}

【最も効いた要因】
- プラス: ${engineResult.topPositive ? `${engineResult.topPositive.label}（${AXIS_LABELS[engineResult.topPositive.axis]}）` : 'なし'}
- マイナス: ${engineResult.topNegative ? `${engineResult.topNegative.label}（${AXIS_LABELS[engineResult.topNegative.axis]}）` : 'なし'}

【今日食べたもの（時刻順）】
${formatMeals(context.meals)}

【本人の体感（実測）】
${formatSubjective(context.conditionLog)}
${findingsBlock}

上のデータについて、指定されたフィールドを出力してください。`.trim();

    const prompt = buildPrompt(STATIC_PROMPT, dynamicPrompt);

    let lastError = null;
    for (const modelName of MODELS_TO_TRY) {
        try {
            const model = createModel(genAI, modelName, CONDITION_ANALYSIS_SCHEMA, THINKING.OFF);
            const result = await model.generateContent(prompt);
            const parsed = JSON.parse(result.response.text());
            parsed.model = modelName;

            // AI がスコアを書き換えても採用しない（数値の出所はエンジンだけ）
            delete parsed.axes;
            delete parsed.score;
            return parsed;
        } catch (e) {
            console.warn(`[ConditionAnalysis] Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    return { error: `コンディション解説の生成に失敗しました。(${lastError?.message || 'all models failed'})` };
};
