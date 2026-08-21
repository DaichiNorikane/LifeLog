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
import {
    getCalendarDateKey, getLogicalDateKey, getSleepTargetDateKey, JST_OFFSET_MS,
} from '@/lib/health/conditionDate';
import { ACTIVITY_METRICS, BODY_METRIC_MAP, normalizeBodyFatPercent } from '@/lib/health/healthMetrics';

// ========== 検証ヘルパー ==========

/** x-widget-token を検証する。将来 Firebase ID トークンへ移行する際はここだけ差し替える */
export const verifyWidgetToken = (request) => {
    const token = request?.headers?.get('x-widget-token');
    return Boolean(token) && token === process.env.WIDGET_TOKEN;
};

/**
 * 全角の数字・記号を半角に直す（ショートカットの表示形式に引きずられないため）。
 * 日付にはコロンとスラッシュが全角で混ざることがあるので、そこまで含めて倒す。
 */
const toHalfWidth = (text) =>
    text.replace(/[０-９．－，：／]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

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

/** 曜日表記を落とす。「2026年8月21日金曜日」「2026/08/21(金)」のような長い書式に混ざる */
const stripWeekday = (text) => text
    .replace(/[日月火水木金土]曜日/g, ' ')
    .replace(/[（(][日月火水木金土][)）]/g, ' ');

/** 「日本標準時」「GMT+9」などの明示タイムゾーン。書かれていなければ null */
const extractOffsetMs = (text) => {
    if (/日本標準時|\bJST\b/i.test(text)) return JST_OFFSET_MS;

    const match = /(?:GMT|UTC)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i.exec(text);
    if (!match) return null;

    const hours = Number(match[2]);
    const minutes = Number(match[3] || 0);
    if (hours > 14 || minutes > 59) return null;

    const sign = match[1] === '-' ? -1 : 1;
    return sign * (hours * 60 + minutes) * 60 * 1000;
};

/** 午前/午後・AM/PM を 24 時間表記に直す */
const applyMeridiem = (hour, text) => {
    if (/午前|\bAM\b/i.test(text)) return hour === 12 ? 0 : hour;
    if (/午後|\bPM\b/i.test(text)) return hour === 12 ? 12 : hour + 12;
    return hour;
};

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i;
const DATE_PARTS = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/;
const TIME_PARTS = /(\d{1,2})\s*[:時]\s*(\d{1,2})(?:\s*[:分]\s*(\d{1,2}))?/;

/**
 * ショートカットが送ってくる日付表記を Date に直す。読めなければ null。
 *
 * iOSショートカットの「開始日 / 終了日」は Date 型で、JSON のテキスト欄に入れると
 * 端末のロケール表記のまま送られてくる（`2026年8月21日 7:30`）。`new Date()` は
 * これを解釈できないため、そのままでは「送っているのに Missing or invalid と
 * 言われる」という、原因の分かりにくい失敗になる。
 * toFiniteNumber が表示用の数値文字列を吸収しているのと同じ理由で、ここでも表記ゆれを吸収する。
 *
 * 【重要】タイムゾーンを持たない表記は JST の壁時計時刻として組み立てる。
 * 実行環境（Vercel）は UTC で動くため、ここを `new Date()` まかせにすると
 * 同じ文字列が 9 時間ずれて保存される。
 */
export const parseDateInput = (value) => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (!value || typeof value !== 'string') return null;

    const text = stripWeekday(toHalfWidth(value)).trim();
    if (text === '') return null;

    // オフセット付き ISO 8601 は曖昧さがないのでそのまま信用する
    if (ISO_WITH_OFFSET.test(text)) {
        const iso = new Date(text.replace(' ', 'T'));
        return Number.isNaN(iso.getTime()) ? null : iso;
    }

    const dateMatch = DATE_PARTS.exec(text);
    if (!dateMatch) return null;

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    // 日付より後ろだけを時刻の捜索対象にする（`2026/08/21` の 08:21 を時刻と読まないため）
    const rest = text.slice(dateMatch.index + dateMatch[0].length);
    const timeMatch = TIME_PARTS.exec(rest);
    const hour = timeMatch ? applyMeridiem(Number(timeMatch[1]), rest) : 0;
    const minute = timeMatch ? Number(timeMatch[2]) : 0;
    const second = timeMatch?.[3] ? Number(timeMatch[3]) : 0;
    if (hour > 23 || minute > 59 || second > 59) return null;

    const offsetMs = extractOffsetMs(rest) ?? JST_OFFSET_MS;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs);

    // Date.UTC は 2月31日を3月へ繰り上げてしまう。読めなかったものは読めなかったと返す
    const wallClock = new Date(date.getTime() + offsetMs);
    if (wallClock.getUTCMonth() + 1 !== month || wallClock.getUTCDate() !== day) return null;

    return date;
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
        : parseDateInput(measuredAt);
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
    const capturedAtDate = parseDateInput(payload.capturedAt) || new Date();
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
    const start = parseDateInput(raw.start);
    if (!start) return null;

    const end = parseDateInput(raw.end);
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

    const sleepEndDate = parseDateInput(sleepEnd);
    if (!sleepEndDate) {
        // 何が届いたのかを返さないと設定ミスの切り分けができない（writeActivity の rejected と同じ意図）。
        // 空文字ならヘルスケアに睡眠が無い、文字が入っていれば書式が読めない、と一目で分かる。
        return {
            ok: false,
            error: 'Missing or invalid sleepEnd',
            received: sleepEnd === undefined ? null : String(sleepEnd).slice(0, 60),
            status: 400,
        };
    }

    const sleepStartDate = parseDateInput(sleepStart);
    if (sleepStart !== undefined && sleepStart !== null && !sleepStartDate) {
        return { ok: false, error: 'Invalid sleepStart', status: 400 };
    }
    if (sleepStartDate && sleepStartDate >= sleepEndDate) {
        return { ok: false, error: 'sleepStart must be before sleepEnd', status: 400 };
    }

    const date = getSleepTargetDateKey(sleepEndDate);
    const dayMinutes = { min: 0, max: 24 * 60 };

    // ショートカットは睡眠セグメントの合計時間を出せない（HealthKitの睡眠は
    // 数値ではなくカテゴリのサンプルとして入るため「統計を計算」が使えない）。
    // 就寝〜起床の時刻さえ送れば臥床時間が出せるので、届いていなければここで補う。
    // asleepMinutes（実際に眠っていた時間）は推測できないので補わない。
    const spanMinutes = sleepStartDate
        ? Math.round((sleepEndDate - sleepStartDate) / 60000)
        : null;
    const inBedValue = toBoundedNumber(inBedMinutes, dayMinutes)
        ?? toBoundedNumber(spanMinutes, dayMinutes);

    const objective = {
        sleepStart: sleepStartDate ? sleepStartDate.toISOString() : null,
        sleepEnd: sleepEndDate.toISOString(),
        inBedMinutes: inBedValue,
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
