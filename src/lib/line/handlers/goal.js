import { analyzeGoalFeasibility } from '@/app/actions/daily-evaluation';
import {
    getRecentAverageCaloriesAdmin, updateUserProfileAdmin,
} from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { formatElenaText } from '@/lib/line/textFormat';

/**
 * LINE からダイエット目標を確認・変更・診断する。
 *
 * アプリを開かずに「目標カロリー 1800」と送れば変えられるようにする。
 * 目標は毎日いじる値ではないが、思い立った時に直せないと結局そのまま放置されるため、
 * 一番手が届きやすい LINE から触れるようにしておく。
 */

const FULLWIDTH = /[０-９．]/g;
const toHalfWidth = (text) =>
    String(text).replace(FULLWIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

/** 「目標」「目標は？」など、現在の目標を聞いている発話 */
const SHOW_RE = /^(ダイエット)?目標(設定)?(の)?(確認|は|って|を教えて|教えて)?[？?！!]?$/;
/** 「目標診断」「目標を診断して」 */
const DIAGNOSE_RE = /^(ダイエット)?目標(を)?診断(して|してください)?[？?！!]?$/;

const CALORIE_RE = /(?:目標|摂取)カロリー(?:を)?\s*([0-9]{3,5})|カロリー(?:目標|を)\s*([0-9]{3,5})/;
const WEIGHT_RE = /目標体重(?:を)?\s*([0-9]{2,3}(?:\.[0-9]+)?)/;
const DATE_RE = /(?:目標日|期限|目標期限)(?:を)?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2})/;

/** 「12/31」を今年（過ぎていれば来年）の YYYY-MM-DD にする */
const normalizeDate = (raw) => {
    const text = String(raw).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
        const [y, m, d] = text.split('-').map(Number);
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(text);
    if (!slash) return null;

    const month = Number(slash[1]);
    const day = Number(slash[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const now = new Date();
    const year = new Date(now.getFullYear(), month - 1, day) < now
        ? now.getFullYear() + 1   // 過ぎている月日なら来年のこと
        : now.getFullYear();
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * 目標に関する発話かどうかを判定する。該当しなければ null。
 * @returns {{action: 'show'|'diagnose'|'set', patch?: object} | null}
 */
export const parseGoalCommand = (text) => {
    const trimmed = toHalfWidth(String(text || '').trim());
    if (!trimmed) return null;

    if (DIAGNOSE_RE.test(trimmed)) return { action: 'diagnose' };
    if (SHOW_RE.test(trimmed)) return { action: 'show' };

    const patch = {};

    const calorie = CALORIE_RE.exec(trimmed);
    if (calorie) {
        const value = Number(calorie[1] || calorie[2]);
        // 極端な値は取り違えの可能性が高いので受け付けない
        if (value >= 800 && value <= 6000) patch.targetCalories = value;
    }

    const weight = WEIGHT_RE.exec(trimmed);
    if (weight) {
        const value = Number(weight[1]);
        if (value >= 20 && value <= 200) patch.targetWeight = value;
    }

    const date = DATE_RE.exec(trimmed);
    if (date) {
        const normalized = normalizeDate(date[1]);
        if (normalized) patch.targetDate = normalized;
    }

    if (Object.keys(patch).length > 0) return { action: 'set', patch };
    return null;
};

export const isGoalText = (text) => parseGoalCommand(text) !== null;

const formatGoalSummary = (profile = {}, currentWeight = null) => {
    const lines = [];

    if (profile.targetWeight) {
        const remaining = currentWeight != null
            ? ` （あと ${(currentWeight - Number(profile.targetWeight)).toFixed(1)}kg）`
            : '';
        lines.push(`🎯 目標体重: ${profile.targetWeight}kg${remaining}`);
    } else {
        lines.push('🎯 目標体重: 未設定');
    }

    if (profile.targetDate) {
        const days = Math.ceil((new Date(profile.targetDate) - new Date()) / 86400000);
        lines.push(`📅 期限: ${profile.targetDate}${days > 0 ? `（残り${days}日）` : ''}`);
    } else {
        lines.push('📅 期限: 未設定');
    }

    lines.push(`🔥 目標カロリー: ${profile.targetCalories ? `${profile.targetCalories}kcal` : '未設定'}`);

    return lines.join('\n');
};

const HELP = [
    '',
    '変えたいときはこう送ってください👇',
    '・目標カロリー 1800',
    '・目標体重 75',
    '・目標日 12/31',
    '・目標診断（エレナが実現できるか見ます）',
].join('\n');

/** 直近の体重（表示用）。取れなくても本筋は止めない */
const getCurrentWeight = async (uid) => {
    try {
        const { getLatestWeightBefore } = await import('@/lib/firebase/adminHelpers');
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const latest = await getLatestWeightBefore(uid, tomorrow);
        return latest?.weight != null ? Number(latest.weight) : null;
    } catch {
        return null;
    }
};

const FEASIBILITY_LABEL = {
    Impossible: '無理ゲー 😱',
    Strict: 'かなり厳しい 🔥',
    Realistic: '適正ライン ✅',
    Easy: '余裕 ✨',
};

export const handleGoalEvent = async (event, user, command) => {
    const profile = user?.data || {};

    if (command.action === 'show') {
        const currentWeight = await getCurrentWeight(user.uid);
        await replyOrPushMessage(event, {
            type: 'text',
            text: `いまの目標はこうなっています📋\n\n${formatGoalSummary(profile, currentWeight)}\n${HELP}`,
        });
        return { action: 'show' };
    }

    if (command.action === 'set') {
        await updateUserProfileAdmin(user.uid, command.patch);

        const updated = { ...profile, ...command.patch };
        const currentWeight = await getCurrentWeight(user.uid);
        const changed = [];
        if (command.patch.targetCalories) changed.push(`目標カロリーを ${command.patch.targetCalories}kcal`);
        if (command.patch.targetWeight) changed.push(`目標体重を ${command.patch.targetWeight}kg`);
        if (command.patch.targetDate) changed.push(`期限を ${command.patch.targetDate}`);

        await replyOrPushMessage(event, {
            type: 'text',
            text: `${changed.join('、')}に変更しました✅\n\n${formatGoalSummary(updated, currentWeight)}`,
        });
        return { action: 'set', patch: command.patch };
    }

    // diagnose
    const currentWeight = await getCurrentWeight(user.uid);
    if (!currentWeight || !profile.targetWeight || !profile.targetDate) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: `診断には現在の体重・目標体重・期限が必要です🙏\n\n${formatGoalSummary(profile, currentWeight)}\n${HELP}`,
        });
        return { action: 'diagnose', skipped: 'missing_data' };
    }

    const recentCalories = await getRecentAverageCaloriesAdmin(user.uid, 7).catch(() => null);
    const result = await analyzeGoalFeasibility({
        currentWeight,
        targetWeight: Number(profile.targetWeight),
        targetDate: profile.targetDate,
        height: profile.height ? Number(profile.height) : null,
        recentCalories,
        streakDays: 0,
    });

    if (!result || result.error) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: '診断に失敗しました…もう一度試してもらえますか🙏',
        });
        return { action: 'diagnose', error: result?.error || 'unknown' };
    }

    // 診断結果は残しておく（アプリ側の表示と揃える）
    await updateUserProfileAdmin(user.uid, { lastDiagnosis: result });

    const label = FEASIBILITY_LABEL[result.feasibility] || result.feasibility || '';
    const reasoning = formatElenaText(String(result.reasoning || '').replace(/<[^>]*>/g, ''));
    const suggestion = result.recommended_daily_calories
        ? `\n\n目安は 1日 ${result.recommended_daily_calories}kcal です。\nこれにするなら「目標カロリー ${result.recommended_daily_calories}」と送ってください✍️`
        : '';

    await replyOrPushMessage(event, {
        type: 'text',
        text: `判定: ${label}\n\n${reasoning}${suggestion}`,
    });
    return { action: 'diagnose', feasibility: result.feasibility };
};
