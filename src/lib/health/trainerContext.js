/**
 * エレナの日次評価に渡す「生活データ」コンテキスト（純粋関数）
 *
 * 食事記録だけでなく、睡眠・集中力などのコンディション実測をエレナに見せて、
 * 「食事コーチ」から「生活全体のトレーナー」に引き上げるためのモジュール。
 *
 * 【データの帰属ルール（conditionDate.js 参照）】
 * - 「昨夜の睡眠」（実測 sleep.objective ＋ 体感 sleep.subjective）は
 *   論理日 -1 のログ（＝その睡眠を引き起こした食事の日）に保存されている。
 *   したがって今日の評価には sleepLog = conditionLogs/{今日の論理日 - 1} を渡す。
 * - 「今日の集中力・エネルギー・気分」の体感は todayLog = conditionLogs/{今日の論理日}。
 *
 * 【設計方針】
 * - 存在するデータだけを行にする。無いデータは行ごと出さない（AIに作文させないため）。
 * - Web / LINE / cron / push の全経路で同じテキストを使う（唯一の真実）。
 */

const SCALE_LABELS = ['', '最悪', 'いまいち', 'ふつう', 'よい', '絶好調'];

const JST_TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
});

/** ISO文字列 → JSTの "HH:MM"。不正値は null */
export const formatJstTime = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return JST_TIME_FORMAT.format(d);
};

/** 分 → "X.X時間"。不正値は null */
export const formatHours = (minutes) => {
    const n = Number(minutes);
    if (!Number.isFinite(n) || n <= 0) return null;
    return `${Math.round(n / 60 * 10) / 10}時間`;
};

const subjectiveLine = (log, axis, label) => {
    const value = log?.[axis]?.subjective;
    if (typeof value !== 'number' || value < 1 || value > 5) return null;
    return `- ${label}: ${value}/5（${SCALE_LABELS[value]}）`;
};

/** 昨夜の実測睡眠（HealthKit）を1行にする。実測がなければ null */
const objectiveSleepLine = (sleepLog) => {
    const obj = sleepLog?.sleep?.objective;
    if (!obj) return null;

    // 実際に眠っていた時間を優先。無ければ「ベッドにいた時間」と明示して代用
    const asleep = formatHours(obj.asleepMinutes);
    const inBed = formatHours(obj.inBedMinutes);
    const duration = asleep || (inBed ? `${inBed}（ベッドにいた時間）` : null);
    if (!duration) return null;

    const start = formatJstTime(obj.sleepStart);
    const end = formatJstTime(obj.sleepEnd);
    const span = start && end ? `（${start}就寝 → ${end}起床）` : '';
    return `- 昨夜の睡眠（実測）: ${duration}${span}`;
};

/**
 * エレナの日次評価プロンプトに埋め込む「生活データ」ブロックを組み立てる。
 *
 * @param {object} params
 * @param {object|null} params.sleepLog  conditionLogs/{今日の論理日 - 1}（昨夜の睡眠が入っている）
 * @param {object|null} params.todayLog  conditionLogs/{今日の論理日}（今日の体感が入っている）
 * @param {string|null} params.bedtime   就寝予定時刻 'HH:MM'（profile.bedtime）
 * @param {object|null} params.activity  activityLogs/{今日}（steps / activeEnergy など）
 * @param {string[]}    params.findings  toDisplayableFindings() の出力（個人相関の知見）
 * @returns {string|null} プロンプト用テキスト。データが1つも無ければ null
 */
export const buildTrainerContextText = ({
    sleepLog = null,
    todayLog = null,
    bedtime = null,
    activity = null,
    findings = [],
} = {}) => {
    const lines = [
        objectiveSleepLine(sleepLog),
        subjectiveLine(sleepLog, 'sleep', '昨夜の眠りの体感'),
        subjectiveLine(todayLog, 'focus', '今日の集中力の体感'),
        subjectiveLine(todayLog, 'energy', '今日のエネルギーの体感'),
        subjectiveLine(todayLog, 'mood', '今日の気分の体感'),
    ].filter(Boolean);

    const steps = Number(activity?.steps);
    if (Number.isFinite(steps) && steps > 0) {
        const energy = Number(activity?.activeEnergy);
        const energyPart = Number.isFinite(energy) && energy > 0
            ? ` / 活動消費 約${Math.round(energy)}kcal`
            : '';
        lines.push(`- 今日の歩数: ${Math.round(steps).toLocaleString('ja-JP')}歩${energyPart}`);
    }

    if (typeof bedtime === 'string' && /^\d{1,2}:\d{2}$/.test(bedtime.trim())) {
        lines.push(`- 就寝予定時刻: ${bedtime.trim()}`);
    }

    const validFindings = (Array.isArray(findings) ? findings : []).filter(Boolean);

    if (lines.length === 0 && validFindings.length === 0) return null;

    const blocks = [];
    if (lines.length > 0) {
        blocks.push(`【あなたの生活データ（実測）】\n${lines.join('\n')}`);
    }
    if (validFindings.length > 0) {
        blocks.push(
            `【この人に特有の傾向（過去データの相関観察。断定はしない）】\n${validFindings.map(f => `- ${f}`).join('\n')}`
        );
    }
    return blocks.join('\n\n');
};
