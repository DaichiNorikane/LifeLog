import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase/admin';
import { getSleepTargetDateKey } from '@/lib/health/conditionDate';

// HealthKit（iOSショートカット経由）からの睡眠データ受信API。
// 認証・日付キーの扱いは /api/health/weight と同じ方式に揃えている。

const toFiniteNumber = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

/** 0 以上・上限以下の値だけ採用する（HealthKitのソースによっては異常値が混じる） */
const toBoundedMinutes = (value, max) => {
    const number = toFiniteNumber(value);
    if (number === null) return null;
    if (number < 0 || number > max) return null;
    return number;
};

const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export async function POST(request) {
    const token = request.headers.get('x-widget-token');
    if (!token || token !== process.env.WIDGET_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const {
        uid, sleepStart, sleepEnd, inBedMinutes, asleepMinutes,
        deepMinutes, remMinutes, awakenings,
    } = body || {};

    if (!uid) {
        return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    const sleepEndDate = parseDate(sleepEnd);
    if (!sleepEndDate) {
        return NextResponse.json({ error: 'Missing or invalid sleepEnd' }, { status: 400 });
    }

    const sleepStartDate = parseDate(sleepStart);
    if (sleepStart !== undefined && sleepStart !== null && !sleepStartDate) {
        return NextResponse.json({ error: 'Invalid sleepStart' }, { status: 400 });
    }
    if (sleepStartDate && sleepStartDate >= sleepEndDate) {
        return NextResponse.json({ error: 'sleepStart must be before sleepEnd' }, { status: 400 });
    }

    // 起床時刻から「その睡眠を引き起こした食事の日」を求める。
    // 例) 7/30 8:00 起床 → 7/29 の食事が原因 → 7/29 のログに保存
    const date = getSleepTargetDateKey(sleepEndDate);

    const objective = {
        sleepStart: sleepStartDate ? sleepStartDate.toISOString() : null,
        sleepEnd: sleepEndDate.toISOString(),
        inBedMinutes: toBoundedMinutes(inBedMinutes, 24 * 60),
        asleepMinutes: toBoundedMinutes(asleepMinutes, 24 * 60),
        deepMinutes: toBoundedMinutes(deepMinutes, 24 * 60),
        remMinutes: toBoundedMinutes(remMinutes, 24 * 60),
        awakenings: toBoundedMinutes(awakenings, 100),
    };

    try {
        const ref = db.collection('users').doc(uid).collection('conditionLogs').doc(date);
        const existing = await ref.get();
        // 主観入力が既にあれば source を 'both' にする（表示は主観優先、客観は補助）
        const hasSubjective = existing.exists && existing.data()?.sleep?.subjective != null;

        await ref.set({
            date,
            sleep: {
                objective,
                source: hasSubjective ? 'both' : 'healthkit',
            },
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        return NextResponse.json({ success: true, date, sleep: objective });
    } catch (error) {
        console.error('[Health Sleep] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
