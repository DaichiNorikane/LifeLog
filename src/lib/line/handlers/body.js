import { db } from '@/lib/firebase/admin';
import { getJstDateId, getLatestWeightBefore } from '@/lib/firebase/adminHelpers';
import { getSleepTargetDateKey } from '@/lib/health/conditionDate';
import { ACTIVITY_METRICS, calcFatMass, formatMetric } from '@/lib/health/healthMetrics';
import { replyOrPushMessage } from '@/lib/line/client';

/**
 * 「からだ」— ヘルスケアから届いた実測値を LINE で返す。
 *
 * リッチメニューの1枠がここに繋がる。アプリを開かなくても
 * 歩数・消費・睡眠・体組成が確認できるようにする。
 */

export const BODY_TEXT_RE = /^(からだ|カラダ|体|今日のからだ|体調|健康)(は|って)?[？?！!]?$/;

export const isBodyText = (text) => BODY_TEXT_RE.test(String(text || '').trim());

const formatSleep = (objective) => {
    if (!objective) return null;
    const minutes = objective.asleepMinutes ?? objective.inBedMinutes;
    if (minutes === null || minutes === undefined) return null;

    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    const duration = hours > 0 ? `${hours}時間${rest}分` : `${rest}分`;

    const clock = (iso) => {
        if (!iso) return null;
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return null;
        return new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
        }).format(date);
    };

    const start = clock(objective.sleepStart);
    const end = clock(objective.sleepEnd);
    return start && end ? `${duration}（${start} → ${end}）` : duration;
};

const getActivityLog = async (uid, dateId) => {
    const snap = await db.collection('users').doc(uid)
        .collection('activityLogs').doc(dateId).get();
    return snap.exists ? snap.data() : null;
};

const getSleepObjective = async (uid) => {
    const snap = await db.collection('users').doc(uid)
        .collection('conditionLogs').doc(getSleepTargetDateKey()).get();
    return snap.exists ? (snap.data()?.sleep?.objective || null) : null;
};

const getWorkoutsForDate = async (uid, dateId) => {
    const snap = await db.collection('users').doc(uid)
        .collection('workouts').where('date', '==', dateId).limit(5).get();
    return snap.docs.map(doc => doc.data());
};

export const handleBodyEvent = async (event, user) => {
    const dateId = getJstDateId(new Date());

    const [activity, sleep, workouts, latestWeight] = await Promise.all([
        getActivityLog(user.uid, dateId).catch(() => null),
        getSleepObjective(user.uid).catch(() => null),
        getWorkoutsForDate(user.uid, dateId).catch(() => []),
        getLatestWeightBefore(
            user.uid,
            new Date(Date.now() + 86400000).toISOString().split('T')[0],
        ).catch(() => null),
    ]);

    const lines = [];

    // 動いた量（primary の指標だけ。全部並べると読むのがつらい）
    const moved = ACTIVITY_METRICS
        .filter(metric => metric.primary && activity?.[metric.key] != null)
        .map(metric => `${metric.label} ${formatMetric(metric.key, activity[metric.key])}${metric.unit}`);
    if (moved.length > 0) lines.push(`👟 ${moved.join(' / ')}`);

    const sleepText = formatSleep(sleep);
    if (sleepText) lines.push(`😴 昨夜の睡眠 ${sleepText}`);

    for (const workout of workouts) {
        const parts = [`${workout.typeLabel || workout.type} ${workout.durationMinutes}分`];
        if (workout.distanceKm != null) parts.push(`${formatMetric('distanceKm', workout.distanceKm)}km`);
        if (workout.activeEnergy != null) parts.push(`${Math.round(workout.activeEnergy)}kcal`);
        lines.push(`🏃 ${parts.join(' / ')}`);
    }

    // HealthKit 由来の値は 74.30000000001 のような浮動小数点誤差を含むことがあるので、
    // 生の値をそのまま出さず、必ず formatMetric（指標ごとの桁数定義）を通す
    if (latestWeight?.weight != null) {
        const body = [`体重 ${formatMetric('weight', latestWeight.weight)}kg`];
        if (latestWeight.bodyFat != null) {
            body.push(`体脂肪 ${formatMetric('bodyFat', latestWeight.bodyFat)}%`);
            const fatMass = calcFatMass(latestWeight.weight, latestWeight.bodyFat);
            if (fatMass != null) body.push(`脂肪 ${fatMass.toFixed(1)}kg`);
        }
        if (latestWeight.leanBodyMass != null) body.push(`除脂肪 ${formatMetric('leanBodyMass', latestWeight.leanBodyMass)}kg`);
        if (latestWeight.bmi != null) body.push(`BMI ${formatMetric('bmi', latestWeight.bmi)}`);
        lines.push(`⚖️ ${body.join(' / ')}`);

        const target = user.data?.targetWeight;
        if (target) {
            const diff = Number(latestWeight.weight) - Number(target);
            lines.push(diff > 0
                ? `🎯 目標まであと ${diff.toFixed(1)}kg`
                : '🎯 目標を達成しています🎉');
        }
    }

    if (lines.length === 0) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'まだ今日のデータが届いていません📭\niPhoneのショートカット「Lifelog同期」を実行すると、歩数や体重がここに出ます💪',
        });
        return { empty: true };
    }

    await replyOrPushMessage(event, {
        type: 'text',
        text: `今日のからだ📊\n\n${lines.join('\n')}`,
    });
    return { lines: lines.length };
};
