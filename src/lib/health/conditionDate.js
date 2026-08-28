/**
 * コンディション機能の「日付」ルール（唯一の真実）
 *
 * ダッシュボードの食事一覧はカレンダー日（0:00 区切り）で動いているが、
 * コンディションは **論理日（4:00 区切り）** で扱う。
 *
 * 理由: 就寝が 0:00〜2:00 のユーザーの場合、
 *   「7/30 の 1:00 に食べたラーメン」はカレンダー上は 7/30 だが、
 *   体感としては 7/29 の夜食であり、影響が出るのは 7/29→7/30 の睡眠。
 *   0:00 で切ると原因と結果が別の日に分かれてしまい、相関が取れない。
 *
 * 睡眠の帰属ルール:
 *   睡眠は「その夜を引き起こした食事の日」に紐づける。
 *   つまり 7/29 の夕食 → 7/29→7/30 の睡眠 → 7/30 朝に回答 → **7/29 のログに保存**。
 *   こうしないと予測（7/29 の食事から算出）と実測が別キーになり突き合わせできない。
 */

/** 論理日の切り替え時刻（JST）。この時刻より前は前日の続きとして扱う */
export const DAY_BOUNDARY_HOUR = 4;

/** JST の UTC からのずれ。タイムゾーンを持たない入力を組み立てるときの既定値でもある */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 任意の Date を JST の {year, month, day, hour, minute} に分解する（サーバー/クライアント共通） */
export const getJstParts = (date = new Date()) => {
    const jst = new Date(date.getTime() + JST_OFFSET_MS);
    return {
        year: jst.getUTCFullYear(),
        month: jst.getUTCMonth() + 1,
        day: jst.getUTCDate(),
        hour: jst.getUTCHours(),
        minute: jst.getUTCMinutes(),
    };
};

const pad = (n) => String(n).padStart(2, '0');

/** JST のカレンダー日キー (YYYY-MM-DD)。既存の weights / dailyEvaluations と同じ区切り */
export const getCalendarDateKey = (date = new Date()) => {
    const { year, month, day } = getJstParts(date);
    return `${year}-${pad(month)}-${pad(day)}`;
};

/**
 * 論理日キー (YYYY-MM-DD)。
 * JST 0:00〜3:59 は前日として扱う（深夜の食事を前日の夜として集計するため）。
 */
export const getLogicalDateKey = (date = new Date(), boundaryHour = DAY_BOUNDARY_HOUR) => {
    const shifted = new Date(date.getTime() - boundaryHour * 60 * 60 * 1000);
    return getCalendarDateKey(shifted);
};

/**
 * 論理日の中での「通し時刻」。0:00〜3:59 は 24〜27 時として扱う。
 * 深夜1時のコーヒーを「1時＝朝より前」と誤判定しないために必要。
 */
export const getLogicalHour = (date = new Date()) => {
    const { hour } = getJstParts(date);
    return hour < DAY_BOUNDARY_HOUR ? hour + 24 : hour;
};

/** 日付キーを n 日ずらす（負値で過去へ） */
export const shiftDateKey = (dateKey, days) => {
    const [y, m, d] = String(dateKey).split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCDate(base.getUTCDate() + days);
    return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
};

/**
 * 「昨夜の睡眠」を保存すべき日付キー。
 *
 * 朝に「昨夜眠れましたか？」と聞いた回答は、その夜の原因となった食事の日に保存する。
 *   例) 7/30 の 9:00 に回答 → 論理日 7/30 → 保存先は 7/29
 *   例) 7/30 の 1:00 に回答 → 論理日 7/29（まだ寝ていない）→ 保存先は 7/28
 */
export const getSleepTargetDateKey = (date = new Date()) =>
    shiftDateKey(getLogicalDateKey(date), -1);

/**
 * 就寝予定時刻の実時刻を求める。
 * bedtime が 0:00〜3:59 の場合は「翌日のその時刻」を返す（日をまたぐため）。
 *
 * @param {string} dateKey 論理日 (YYYY-MM-DD)
 * @param {string} bedtime 'HH:MM'
 * @returns {Date|null} JST の該当時刻を表す Date。不正値なら null
 */
export const resolveBedtime = (dateKey, bedtime) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(bedtime || '').trim());
    if (!match) return null;

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;

    const [y, m, d] = String(dateKey).split('-').map(Number);
    if (!y || !m || !d) return null;

    // 論理日の境界より前の時刻＝日付が変わった後の就寝なので翌日にずらす
    const dayOffset = hour < DAY_BOUNDARY_HOUR ? 1 : 0;
    // JST の壁時計時刻を UTC 基準の Date として構築する
    return new Date(Date.UTC(y, m - 1, d + dayOffset, hour, minute) - JST_OFFSET_MS);
};

/** 食事時刻から就寝までの残り時間（時間単位）。就寝後なら負値。判定不能なら null */
export const hoursUntilBedtime = (mealTimestamp, dateKey, bedtime) => {
    const bed = resolveBedtime(dateKey, bedtime);
    if (!bed) return null;
    const meal = new Date(mealTimestamp);
    if (Number.isNaN(meal.getTime())) return null;
    return (bed.getTime() - meal.getTime()) / (60 * 60 * 1000);
};

/** その論理日に属する食事だけを取り出す（時刻の昇順） */
export const filterMealsForLogicalDate = (meals = [], dateKey) =>
    meals
        .filter((meal) => {
            const t = new Date(meal?.timestamp);
            if (Number.isNaN(t.getTime())) return false;
            return getLogicalDateKey(t) === dateKey;
        })
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

/** プロフィール未設定時の既定値 */
export const DEFAULT_SLEEP_SCHEDULE = {
    bedtime: '01:00',
    wakeTime: '08:00',
};
