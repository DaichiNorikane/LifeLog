import { formatMetric } from '@/lib/health/healthMetrics';

/**
 * 「LINE共有用に出力」の中身（唯一の真実・純粋関数）。
 *
 * アプリ内のボタンとエレナの LINE の両方がここを通るので、
 * どちらから出しても同じテキスト・同じグラフになる。
 *
 * 書式はエレナの口調を使わず、項目と数値だけを並べる。
 * 家族や友人に転送する前提なので、絵文字や励ましの言葉は入れない。
 *
 * 体年齢（bodyAge）は HealthKit に相当する型がないため、今は自動では入らない。
 * weights ドキュメントに値がある日だけ出し、無ければ行ごと省く（0 や「―」で埋めない）。
 */

/** 推移グラフに載せる日数 */
export const SHARE_TREND_DAYS = 30;

/** グラフに描く指標。label は画像用（チャート描画のフォントが日本語を持たないため英字） */
export const SHARE_TREND_METRICS = [
    { key: 'weight', label: 'Weight', unit: 'kg', decimals: 1, color: '#2563eb' },
    { key: 'bodyFat', label: 'Body fat', unit: '%', decimals: 1, color: '#ea580c' },
    { key: 'bodyAge', label: 'Body age', unit: '', decimals: 0, color: '#16a34a' },
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

/** YYYY-MM-DD → 「2026/10/01(木)」 */
export const formatShareDate = (dateId) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateId || ''));
    if (!match) return String(dateId || '');
    const [, y, m, d] = match;
    const weekday = WEEKDAYS[new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay()];
    return `${y}/${m}/${d}(${weekday})`;
};

const shortDate = (dateId) => {
    const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(dateId || ''));
    return match ? `${Number(match[1])}/${Number(match[2])}` : String(dateId || '');
};

const signed = (value, decimals) => {
    const fixed = Math.abs(value).toFixed(decimals);
    if (Number(fixed) === 0) return `±${fixed}`;
    return value > 0 ? `+${fixed}` : `-${fixed}`;
};

/**
 * dateId 以前で最も新しい体組成と、その1つ前の体重記録を返す。
 * weights は順不同でよい（Firestore からの取り方に依存させない）。
 */
export const pickBodyRecords = (weights = [], dateId) => {
    const sorted = (weights || [])
        .filter(entry => entry?.date && entry.date <= dateId && toNumberOrNull(entry.weight) !== null)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    return { latest: sorted[0] || null, previous: sorted[1] || null };
};

/**
 * 共有用テキストを組み立てる。
 * @param {object} p
 * @param {string} p.dateId          対象日 YYYY-MM-DD（JST）
 * @param {number|null} p.totalCalories その日の摂取カロリー合計。記録がなければ null
 * @param {number|null} p.targetCalories 目標カロリー
 * @param {Array} p.weights          users/{uid}/weights の配列
 */
export const buildShareText = ({ dateId, totalCalories = null, targetCalories = null, weights = [] }) => {
    const lines = [`${formatShareDate(dateId)} の記録`];

    const total = toNumberOrNull(totalCalories);
    const target = toNumberOrNull(targetCalories);
    const fmt = (value) => Math.round(value).toLocaleString('ja-JP');
    if (total === null) {
        lines.push(`摂取カロリー: 未記録${target === null ? '' : `（目標 ${fmt(target)} kcal）`}`);
    } else {
        lines.push(`摂取カロリー: ${fmt(total)}${target === null ? '' : ` / ${fmt(target)}`} kcal`);
    }

    const { latest, previous } = pickBodyRecords(weights, dateId);
    if (latest) {
        const measuredOn = latest.date === dateId ? '' : `（${shortDate(latest.date)} 計測）`;
        const weight = toNumberOrNull(latest.weight);
        const prevWeight = toNumberOrNull(previous?.weight);
        const diff = prevWeight === null ? '' : `（前回比 ${signed(weight - prevWeight, 1)} kg）`;
        lines.push(`体重: ${formatMetric('weight', weight)} kg${diff}${measuredOn}`);

        const bodyFat = toNumberOrNull(latest.bodyFat);
        if (bodyFat !== null) lines.push(`体脂肪率: ${formatMetric('bodyFat', bodyFat)} %`);

        const bodyAge = toNumberOrNull(latest.bodyAge);
        if (bodyAge !== null) lines.push(`体年齢: ${Math.round(bodyAge)} 歳`);
    } else {
        lines.push('体重: 未計測');
    }

    return lines.join('\n');
};

/** dateId から days 日さかのぼった日付（その日を含めて days 日分の初日） */
export const trendStartDateId = (dateId, days = SHARE_TREND_DAYS) => {
    const [y, m, d] = String(dateId).split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d - (days - 1)));
    return start.toISOString().slice(0, 10);
};

/**
 * グラフ用の系列。日付昇順で、対象期間に入る記録だけ。
 * 値が取れていない指標は null のまま残す（グラフ側で線を途切れさせる）。
 */
export const buildTrendSeries = (weights = [], dateId, days = SHARE_TREND_DAYS) => {
    const start = trendStartDateId(dateId, days);
    return (weights || [])
        .filter(entry => entry?.date && entry.date >= start && entry.date <= dateId)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map(entry => ({
            date: entry.date,
            weight: toNumberOrNull(entry.weight),
            bodyFat: toNumberOrNull(entry.bodyFat),
            bodyAge: toNumberOrNull(entry.bodyAge),
        }));
};

/** 1点でも値がある指標だけ残す（体年齢のように未取得の指標で空のグラフを出さない） */
export const pickChartMetrics = (series = []) => SHARE_TREND_METRICS
    .filter(metric => series.some(point => point[metric.key] !== null && point[metric.key] !== undefined));

const niceRange = (values) => {
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
        // 1点だけ・横ばいのときに線が上下の枠に張り付かないよう、幅を持たせる
        const pad = Math.max(Math.abs(min) * 0.02, 0.5);
        return { min: min - pad, max: max + pad };
    }
    const pad = (max - min) * 0.15;
    return { min: min - pad, max: max + pad };
};

/**
 * 1指標ぶんの折れ線の座標を計算する（描画ライブラリから独立させてテストできるようにする）。
 * 日付は等間隔ではなく実際の日数で横位置を決める（計測が飛んだ日を詰めない）。
 *
 * @returns {{ segments: Array<Array<{x:number,y:number,value:number,date:string}>>, min:number, max:number, last: object|null }}
 */
export const buildLinePanel = (series, key, { width, height, startDateId, endDateId }) => {
    const points = series.filter(point => point[key] !== null && point[key] !== undefined);
    if (points.length === 0) return { segments: [], min: null, max: null, last: null };

    const dayIndex = (dateId) => Date.parse(`${dateId}T00:00:00Z`) / 86400000;
    const startDay = dayIndex(startDateId);
    const spanDays = Math.max(dayIndex(endDateId) - startDay, 1);
    const { min, max } = niceRange(points.map(point => point[key]));

    const toXY = (point) => ({
        x: Math.round(((dayIndex(point.date) - startDay) / spanDays) * width * 10) / 10,
        y: Math.round((height - ((point[key] - min) / (max - min)) * height) * 10) / 10,
        value: point[key],
        date: point.date,
    });

    // 値が null の日を挟んだら線を切る。計測していない区間を直線で結ぶと、
    // 実際には無い推移を描いてしまうため
    const segments = [];
    let current = [];
    for (const point of series) {
        if (point[key] === null || point[key] === undefined) {
            if (current.length > 0) segments.push(current);
            current = [];
            continue;
        }
        current.push(toXY(point));
    }
    if (current.length > 0) segments.push(current);

    const lastSegment = segments[segments.length - 1];
    return { segments, min, max, last: lastSegment[lastSegment.length - 1] };
};

export { shortDate as formatShortDate };
