/**
 * n=1 の相関分析（パーソナライズ）
 *
 * 「一般論のスコア」を「あなたの場合のスコア」に近づける。
 * この機能の本丸だが、**統計に対して誠実であること**が何よりも優先される。
 *
 * 【必ず守る制約】
 * 1. これは**因果推論ではなく相関の観察**。UI もエレナも「傾向がありそう」以上は言わない
 * 2. サンプルが足りない知見は保存はしても**表示しない**（MIN_SAMPLE_DAYS 未満）
 * 3. 個人係数は 0.5〜1.5 にクランプする（少数データで重みが暴走しないように）
 * 4. 交絡は補正しない（週末は飲酒も夜更かしも同時に起きる）。だからこそ断定しない
 * 5. 「相関が見つからなかった」も価値ある結果として扱う
 */
import { AXES, AXIS_LABELS, DRIVER_WEIGHTS, DRIVER_LABELS } from './conditionRules';

/** 発火群・非発火群それぞれに最低これだけの日数が必要 */
export const MIN_SAMPLE_DAYS = 7;

/** 個人係数の上下限。少数データで重みが暴走しないための安全弁 */
export const COEFFICIENT_RANGE = { min: 0.5, max: 1.5 };

/**
 * 主観スコア(1-5)とエンジンスコア(0-100)の換算比。
 * 100点スケールを5段階に写すので、主観1ポイント ≒ エンジン20ポイント。
 */
const SUBJECTIVE_TO_ENGINE = 20;

/** 実測（主観）が入っている軸だけが分析対象。体感入力があるのは sleep と focus */
const readSubjective = (log, axis) => {
    const value = log?.[axis]?.subjective;
    return typeof value === 'number' && value >= 1 && value <= 5 ? value : null;
};

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

const clamp = (value) =>
    Math.max(COEFFICIENT_RANGE.min, Math.min(COEFFICIENT_RANGE.max, value));

/**
 * 1ドライバー分の観察。
 * 発火した日と発火しなかった日で、実測の主観スコアの平均を比べるだけ。
 */
const observeDriver = (logs, axis, driverKey) => {
    const fired = [];
    const notFired = [];

    for (const log of logs) {
        const actual = readSubjective(log, axis);
        if (actual === null) continue;

        const keys = log?.firedDrivers?.[axis];
        if (!Array.isArray(keys)) continue;

        (keys.includes(driverKey) ? fired : notFired).push(actual);
    }

    if (fired.length < MIN_SAMPLE_DAYS || notFired.length < MIN_SAMPLE_DAYS) {
        return { axis, driver: driverKey, days: fired.length, enoughData: false };
    }

    const observedDelta = mean(fired) - mean(notFired);
    const baseWeight = DRIVER_WEIGHTS[axis]?.[driverKey] ?? 0;
    // 一般論どおりなら主観がどれだけ動くはずか
    const expectedDelta = baseWeight / SUBJECTIVE_TO_ENGINE;

    let coefficient = 1;
    if (expectedDelta !== 0) {
        const ratio = observedDelta / expectedDelta;
        // ratio < 0 = 想定と逆方向。符号は反転させず「効いていない」として弱めるに留める
        // （少数データで符号を反転させるのは危険すぎる）
        coefficient = ratio <= 0 ? COEFFICIENT_RANGE.min : clamp(ratio);
    }

    return {
        axis,
        driver: driverKey,
        enoughData: true,
        days: fired.length,
        comparisonDays: notFired.length,
        observedDelta: Math.round(observedDelta * 100) / 100,
        expectedDelta: Math.round(expectedDelta * 100) / 100,
        direction: observedDelta < 0 ? 'negative' : 'positive',
        coefficient: Math.round(coefficient * 100) / 100,
        // 一般論と食い違っている（想定と逆、または効果が半分以下）
        contradictsBaseline: expectedDelta !== 0 && observedDelta / expectedDelta <= 0.5,
    };
};

/**
 * 保存済みの体感ログから、この人だけの傾向を洗い出す。
 *
 * @param {Array} logs conditionLogs（predicted / firedDrivers / 主観スコアを含む）
 * @returns {{ sampleDays:number, driverWeights:object, findings:Array, analyzedAt:string }}
 */
export const analyzeDriverCorrelations = (logs = []) => {
    const usable = logs.filter(log => log && log.firedDrivers);

    const driverWeights = {};
    const findings = [];

    for (const axis of AXES) {
        // その軸で一度でも発火したドライバーだけを候補にする
        const candidates = new Set();
        for (const log of usable) {
            for (const key of log.firedDrivers?.[axis] || []) candidates.add(key);
        }

        for (const driverKey of candidates) {
            const observation = observeDriver(usable, axis, driverKey);
            if (!observation.enoughData) continue;

            if (!driverWeights[axis]) driverWeights[axis] = {};
            driverWeights[axis][driverKey] = observation.coefficient;
            findings.push(observation);
        }
    }

    // 一般論とのズレが大きい順（＝ユーザーにとって意外な発見から見せる）
    findings.sort((a, b) =>
        Math.abs(b.observedDelta - b.expectedDelta) - Math.abs(a.observedDelta - a.expectedDelta));

    return {
        sampleDays: usable.length,
        driverWeights,
        findings,
        analyzedAt: new Date().toISOString(),
    };
};

/**
 * 知見を日本語の1文にする（エレナのプロンプトと週次サマリーで使う）。
 * 「傾向がありそう」以上の断定はしない。
 */
export const describeFinding = (finding) => {
    if (!finding?.enoughData) return null;

    const label = DRIVER_LABELS[finding.driver] || finding.driver;
    const axisLabel = AXIS_LABELS[finding.axis] || finding.axis;
    const amount = Math.abs(finding.observedDelta).toFixed(1);
    const days = finding.days;

    if (Math.abs(finding.observedDelta) < 0.2) {
        return `「${label}」があった日と無かった日で、${axisLabel}の自己評価はほとんど変わっていません（${days}日分）`;
    }

    const direction = finding.direction === 'negative' ? '下がって' : '上がって';
    return `「${label}」があった日は、${axisLabel}の自己評価が平均 ${amount} ${direction}います（${days}日分）`;
};

/** 表示してよい知見だけを、エレナに渡す文字列の配列にする */
export const toDisplayableFindings = (model, limit = 3) =>
    (model?.findings || [])
        .filter(f => f.enoughData)
        .slice(0, limit)
        .map(describeFinding)
        .filter(Boolean);

/**
 * まだ分析できる段階か。UI で「学習中」を出すために使う。
 * 主観の回答がある日を数える（記録があるだけでは相関は取れない）。
 */
export const countAnalyzableDays = (logs = []) =>
    logs.filter(log =>
        log?.firedDrivers && AXES.some(axis => readSubjective(log, axis) !== null)
    ).length;
