/**
 * HealthKit 受信 API の共通処理（サーバー専用）
 *
 * `/api/health/*` の各ルートと `/api/health/sync` が、同じ検証・同じ書き込みを通るようにする。
 * ここを唯一の入り口にしないと、「単発では入るのにバッチだと入らない」類の
 * 追いにくい不整合が生まれる。
 *
 * 設計方針:
 *   - 認証失敗と uid 欠落だけが 4xx。それ以外の「値がおかしい」は null にして受け入れる。
 *     HealthKit は複数ソースが混ざるため異常値が普通に来る。1項目の異常で
 *     その日の同期を丸ごと失敗させると、取れているデータまで失う。
 *   - 日付キーは既存仕様に合わせる（体重・アクティビティ=カレンダー日 / 睡眠=前夜の帰属日）。
 */

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase/admin';
import { getCalendarDateKey, getLogicalDateKey, getSleepTargetDateKey } from '@/lib/health/conditionDate';
import { ACTIVITY_METRICS, BODY_METRIC_MAP, normalizeBodyFatPercent } from '@/lib/health/healthMetrics';

// ========== 検証ヘルパー ==========

/** x-widget-token を検証する。将来 Firebase ID トークンへ移行する際はここだけ差し替える */
export const verifyWidgetToken = (request) => {
    const token = request?.headers?.get('x-widget-token');
    return Boolean(token) && token === process.env.WIDGET_TOKEN;
};

/** 全角の数字・記号を半角に直す（ショートカットの表示形式に引きずられないため） */
const toHalfWidth = (text) =>
    text.replace(/[０-９．－，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

/**
 * 数値化。空文字・null・非数値は null（0 は 0 のまま通す）。
 *
 * iOSショートカットは「統計を計算」の結果を、そのまま数値ではなく
 * 表示用の文字列として送ってくることがある（`8,421` / `8,421 歩` / `82.6 kg`）。
 * これを弾くと「送っているのに null になる」という原因の分かりにくい失敗になるため、
 * 先頭の数値部分を取り出して受け入れる。
 *
 * ただし数値で始まらない文字列は null のまま（誤った値を作らない）。
 */
export const toFiniteNumber = (value) => {
    if (value === undefined || value === null) return null;

    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    if (typeof value !== 'string') {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    const trimmed = value.trim();
    if (trimmed === '') return null;

    const direct = Number(trimmed);
    if (Number.isFinite(direct)) return direct;

    // 桁区切りと単位を落としてから、先頭の数値だけを取り出す
    const normalized = toHalfWidth(trimmed).replace(/[,\s ]/g, '');
    const match = /^[+-]?\d+(?:\.\d+)?/.exec(normalized);
    if (!match) return null;

    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
};

/** 範囲外を null にする。「取れなかった」と同じ扱いにするのが意図 */
export const toBoundedNumber = (value, { min = -Infinity, max = Infinity } = {}) => {
    const number = toFiniteNumber(value);
    if (number === null) return null;
    if (number < min || number > max) return null;
    return number;
};

/** ISO 文字列などを Date に。不正なら null */
export const parseIsoDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/** Firestore に undefined は書けないので、undefined のキーを落とす */
const stripUndefined = (obj) => Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
);

const weightsDoc = (uid, dateKey) =>
    db.collection('users').doc(uid).collection('weights').doc(dateKey);

const activityDoc = (uid, dateKey) =>
    db.collection('users').doc(uid).collection('activityLogs').doc(dateKey);

const workoutDoc = (uid, workoutId) =>
    db.collection('users').doc(uid).collection('workouts').doc(workoutId);

const conditionDoc = (uid, dateKey) =>
    db.collection('users').doc(uid).collection('conditionLogs').doc(dateKey);

// ========== 体組成 ==========

/**
 * 体組成を users/{uid}/weights/{YYYY-MM-DD} に保存する。
 * eufy 体組成計 → EufyLife → Apple ヘルスケア → ショートカット、で届く5項目を受ける。
 *
 * @returns {{ok: true, date, ...values} | {ok: false, error, status}}
 */
export const writeWeight = async (uid, payload = {}) => {
    const { weight, bodyFat, bmi, leanBodyMass, height, measuredAt } = payload;

    if (weight === undefined || weight === null) {
        return { ok: false, error: 'Missing weight', status: 400 };
    }

    const weightValue = toFiniteNumber(weight);
    if (weightValue === null || weightValue <= 0 || weightValue >= 500) {
        return { ok: false, error: 'Invalid weight', status: 400 };
    }

    const measuredAtDate = measuredAt === undefined || measuredAt === null
        ? new Date()
        : parseIsoDate(measuredAt);
    if (!measuredAtDate) {
        return { ok: false, error: 'Invalid measuredAt', status: 400 };
    }

    const date = getCalendarDateKey(measuredAtDate);
    const bodyFatValue = toBoundedNumber(
        normalizeBodyFatPercent(bodyFat),
        BODY_METRIC_MAP.bodyFat,
    );
    const bmiValue = toBoundedNumber(bmi, BODY_METRIC_MAP.bmi);
    const leanBodyMassValue = toBoundedNumber(leanBodyMass, BODY_METRIC_MAP.leanBodyMass);
    const heightValue = toBoundedNumber(height, BODY_METRIC_MAP.height);

    const record = {
        weight: weightValue,
        bodyFat: bodyFatValue,
        bmi: bmiValue,
        leanBodyMass: leanBodyMassValue,
        height: heightValue,
        date,
        timestamp: measuredAtDate.toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
        source: 'healthkit',
    };

    await weightsDoc(uid, date).set(record, { merge: true });

    return {
        ok: true,
        date,
        weight: weightValue,
        bodyFat: bodyFatValue,
        bmi: bmiValue,
        leanBodyMass: leanBodyMassValue,
        height: heightValue,
    };
};

// ========== 日次アクティビティ ==========

/**
 * 日次アクティビティを users/{uid}/activityLogs/{YYYY-MM-DD} に保存する。
 *
 * 日付キーはカレンダー日。HealthKit 側の日次集計（0:00 区切り）と揃える必要があるため、
 * コンディションの論理日（4:00 区切り）は使わない。この非対称は意図的。
 *
 * 送られてこなかった指標は**書き込まない**（merge のため既存値が残る）。
 * 「歩数だけ再送」のようなショートカットを許すため。
 */
export const writeActivity = async (uid, payload = {}) => {
    const capturedAtDate = parseIsoDate(payload.capturedAt) || new Date();
    const targetDate = payload.date ? String(payload.date) : getCalendarDateKey(capturedAtDate);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        return { ok: false, error: 'Invalid date', status: 400 };
    }

    const values = {};
    // 値は届いたのに数値にできなかったものを記録する。
    // ショートカットの設定ミスは「null になる」という形でしか現れず原因が分からないため、
    // 実際に何が届いたのかを応答に返して切り分けられるようにする。
    const rejected = {};
    let received = 0;

    for (const metric of ACTIVITY_METRICS) {
        const raw = payload[metric.key];
        if (raw === undefined) continue;      // 送られていない → 触らない
        received += 1;

        const parsed = toBoundedNumber(raw, metric);  // 範囲外・空は null
        values[metric.key] = parsed;

        if (parsed === null && raw !== null && String(raw).trim() !== '') {
            rejected[metric.key] = String(raw).slice(0, 40);
        }
    }

    if (received === 0) {
        return { ok: false, error: 'No activity metrics', status: 400 };
    }

    const record = {
        ...values,
        date: targetDate,
        source: 'healthkit',
        capturedAt: capturedAtDate.toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    await activityDoc(uid, targetDate).set(record, { merge: true });

    return {
        ok: true,
        date: targetDate,
        metrics: values,
        ...(Object.keys(rejected).length > 0 ? { rejected } : {}),
    };
};

// ========== ワークアウト ==========

/** Firestore のドキュメントIDに使えない文字を落とす */
const sanitizeDocId = (value) => String(value).replace(/[/\\.#$[\]\s:]/g, '-').slice(0, 200);

/**
 * ワークアウト1件を正規化する。ID は冪等キー。
 * 同じショートカットを1日に何度実行しても重複しないよう、
 * HealthKit の UUID があればそれを、無ければ「開始時刻＋種目」を ID にする。
 */
export const normalizeWorkout = (raw = {}) => {
    const start = parseIsoDate(raw.start);
    if (!start) return null;

    const end = parseIsoDate(raw.end);
    const durationFromRange = end && end > start
        ? Math.round((end - start) / 60000)
        : null;
    const duration = toBoundedNumber(raw.durationMinutes, { min: 1, max: 1440 }) ?? durationFromRange;
    if (duration === null || duration < 1 || duration > 1440) return null;

    const type = raw.type ? String(raw.type).slice(0, 60) : 'other';
    const id = sanitizeDocId(raw.id || `${start.toISOString()}_${type}`);

    return {
        id,
        record: {
            type,
            typeLabel: raw.typeLabel ? String(raw.typeLabel).slice(0, 60) : null,
            start: start.toISOString(),
            end: end ? end.toISOString() : new Date(start.getTime() + duration * 60000).toISOString(),
            durationMinutes: duration,
            activeEnergy: toBoundedNumber(raw.activeEnergy, { min: 0, max: 10000 }),
            distanceKm: toBoundedNumber(raw.distanceKm, { min: 0, max: 300 }),
            avgHeartRate: toBoundedNumber(raw.avgHeartRate, { min: 25, max: 250 }),
            date: getCalendarDateKey(start),
            logicalDate: getLogicalDateKey(start),
            source: 'healthkit',
            updatedAt: FieldValue.serverTimestamp(),
        },
    };
};

/** ワークアウトをまとめて保存。不正な1件は skip し、残りは書き込む */
export const writeWorkouts = async (uid, list = []) => {
    const items = Array.isArray(list) ? list : [list];
    if (items.length === 0) return { ok: false, error: 'No workouts', status: 400 };

    let written = 0;
    let skipped = 0;
    const dates = new Set();

    for (const raw of items) {
        const normalized = normalizeWorkout(raw);
        if (!normalized) {
            skipped += 1;
            continue;
        }
        await workoutDoc(uid, normalized.id).set(normalized.record, { merge: true });
        dates.add(normalized.record.date);
        written += 1;
    }

    if (written === 0) return { ok: false, error: 'No valid workouts', status: 400 };

    return { ok: true, written, skipped, dates: [...dates] };
};

// ========== 睡眠 ==========

/**
 * 睡眠を users/{uid}/conditionLogs/{YYYY-MM-DD}.sleep.objective に保存する。
 *
 * 日付キーは「その睡眠を引き起こした食事の日」＝起床日の前日。
 * 予測（前日の食事から算出）と実測を同じキーに揃えないと相関が取れない。
 * 詳細は src/lib/health/conditionDate.js のコメントを参照。
 */
export const writeSleep = async (uid, payload = {}) => {
    const {
        sleepStart, sleepEnd, inBedMinutes, asleepMinutes,
        deepMinutes, remMinutes, awakenings,
    } = payload;

    const sleepEndDate = parseIsoDate(sleepEnd);
    if (!sleepEndDate) {
        return { ok: false, error: 'Missing or invalid sleepEnd', status: 400 };
    }

    const sleepStartDate = parseIsoDate(sleepStart);
    if (sleepStart !== undefined && sleepStart !== null && !sleepStartDate) {
        return { ok: false, error: 'Invalid sleepStart', status: 400 };
    }
    if (sleepStartDate && sleepStartDate >= sleepEndDate) {
        return { ok: false, error: 'sleepStart must be before sleepEnd', status: 400 };
    }

    const date = getSleepTargetDateKey(sleepEndDate);
    const dayMinutes = { min: 0, max: 24 * 60 };

    const objective = {
        sleepStart: sleepStartDate ? sleepStartDate.toISOString() : null,
        sleepEnd: sleepEndDate.toISOString(),
        inBedMinutes: toBoundedNumber(inBedMinutes, dayMinutes),
        asleepMinutes: toBoundedNumber(asleepMinutes, dayMinutes),
        deepMinutes: toBoundedNumber(deepMinutes, dayMinutes),
        remMinutes: toBoundedNumber(remMinutes, dayMinutes),
        awakenings: toBoundedNumber(awakenings, { min: 0, max: 100 }),
    };

    const ref = conditionDoc(uid, date);
    const existing = await ref.get();
    // 主観入力が既にあれば source を 'both' にする（表示は主観優先、客観は補助）
    const hasSubjective = existing.exists && existing.data()?.sleep?.subjective != null;

    await ref.set(stripUndefined({
        date,
        sleep: {
            objective,
            source: hasSubjective ? 'both' : 'healthkit',
        },
        updatedAt: FieldValue.serverTimestamp(),
    }), { merge: true });

    return { ok: true, date, sleep: objective };
};
