// 週間レポートの集計とメッセージ組み立て。
// 毎週の自動配信（cron/weekly-summary）と、LINEのオンデマンド表示（「週間レポート」）の両方が使う。

import { db } from '@/lib/firebase/admin';

export const ELENA_WEEKLY_COMMENTS = {
    perfect: [
        '7日全部記録！完璧すぎませんか！？もう習慣マスターですよ✨',
        'パーフェクト記録！エレナ、感動しています…来週も一緒に頑張りましょうね😭✨',
    ],
    great: [
        'すごい！ほぼ毎日記録できていますね！あと少しでパーフェクト🔥',
        'いい感じです！この調子なら来週はもっといけますよ💪',
    ],
    good: [
        '半分以上記録できましたね！少しずつ増やしていきましょう🍀',
        'まずまずです！来週はあと1日多く記録してみませんか？😊',
    ],
    low: [
        '今週はちょっと少なかったですね。でも大丈夫、来週リセットですよ！',
        '忙しかったですか？来週は1日でも多く記録できるといいですね♪',
    ],
};

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const getWeeklyComment = (recordDays) => {
    if (recordDays === 7) return pickRandom(ELENA_WEEKLY_COMMENTS.perfect);
    if (recordDays >= 5) return pickRandom(ELENA_WEEKLY_COMMENTS.great);
    if (recordDays >= 3) return pickRandom(ELENA_WEEKLY_COMMENTS.good);
    return pickRandom(ELENA_WEEKLY_COMMENTS.low);
};

/**
 * 集計対象の週の日付一覧（YYYY-MM-DD）。
 * cron と同じく「今日を含まない直近7日」（昨日までの1週間）を対象にする。
 */
export const getWeekDates = (todayStr) => {
    const today = new Date(todayStr + 'T12:00:00+09:00');
    const weekDates = [];
    for (let i = 7; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        weekDates.push(d.toISOString().split('T')[0]);
    }
    return weekDates;
};

/**
 * 1ユーザー分の週間集計。
 * 日次評価（daily_evaluations）の有無を「記録日」とし、スコア平均と体重変化を添える。
 */
export const collectWeeklyStats = async (uid, weekDates) => {
    const weekStart = weekDates[0];
    const weekEnd = weekDates[weekDates.length - 1];
    const userRef = db.collection('users').doc(uid);

    let recordDays = 0;
    let totalScore = 0;
    let scoreCount = 0;

    for (const dateStr of weekDates) {
        const dateKey = dateStr.replace(/-/g, '');
        const evalDoc = await userRef.collection('daily_evaluations').doc(dateKey).get();
        if (evalDoc.exists) {
            recordDays++;
            const score = evalDoc.data().score;
            if (score != null) {
                totalScore += score;
                scoreCount++;
            }
        }
    }

    const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : '-';

    let weightText = '';
    const [startWeightDoc, endWeightDoc] = await Promise.all([
        userRef.collection('weights').doc(weekStart).get(),
        userRef.collection('weights').doc(weekEnd).get(),
    ]);
    if (startWeightDoc.exists && endWeightDoc.exists) {
        // HealthKit 由来の体重は浮動小数点誤差を含むことがあるので、表示前に必ず丸める
        const round1 = (value) => Math.round(Number(value) * 10) / 10;
        const startW = round1(startWeightDoc.data().weight);
        const endW = round1(endWeightDoc.data().weight);
        const diff = (endW - startW).toFixed(1);
        const sign = diff > 0 ? '+' : '';
        weightText = `\n体重: ${startW}kg → ${endW}kg (${sign}${diff}kg)`;
    }

    return { weekStart, weekEnd, recordDays, avgScore, weightText };
};

export const buildWeeklyReportText = ({ weekStart, weekEnd, recordDays, avgScore, weightText = '', comment, insightText = '' }) =>
    `【週間レポート by エレナ 📊】\n期間: ${weekStart} 〜 ${weekEnd}\n記録日数: ${recordDays}/7日\n平均スコア: ${avgScore}点${weightText}\n\nエレナ: ${comment}${insightText}`;
