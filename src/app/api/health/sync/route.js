import { NextResponse } from 'next/server';
import {
    verifyWidgetToken, writeActivity, writeSleep, writeWeight, writeWorkouts,
} from '@/lib/health/ingest';

/**
 * HealthKit まとめて受信API。
 *
 * ショートカットを機能ごとに分けると、ユーザーが作るオートメーションが5個になり
 * 現実的に設定しきれない。1本の POST で体組成・アクティビティ・ワークアウト・睡眠を全部受ける。
 *
 * 【重要】部分成功を許す。
 * 体脂肪が取れない日、ワークアウトが無い日は普通にある。
 * 1ドメインの失敗で全体を 400 にすると、取れているデータまで捨てることになる。
 */

const DOMAINS = [
    { key: 'weight', run: (uid, value) => writeWeight(uid, value) },
    { key: 'activity', run: (uid, value, capturedAt) => writeActivity(uid, { capturedAt, ...value }) },
    { key: 'workouts', run: (uid, value) => writeWorkouts(uid, value) },
    { key: 'sleep', run: (uid, value) => writeSleep(uid, value) },
];

export async function POST(request) {
    if (!verifyWidgetToken(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { uid, capturedAt } = body || {};
    if (!uid) {
        return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    const present = DOMAINS.filter(({ key }) => body[key] !== undefined && body[key] !== null);
    if (present.length === 0) {
        return NextResponse.json({ error: 'No data' }, { status: 400 });
    }

    const results = {};
    let anySuccess = false;

    for (const { key, run } of present) {
        try {
            const result = await run(uid, body[key], capturedAt);
            if (result.ok) {
                anySuccess = true;
                const { ok, status, ...rest } = result;
                results[key] = { ok: true, ...rest };
            } else {
                results[key] = { ok: false, error: result.error };
            }
        } catch (error) {
            // 1ドメインの例外で他のドメインを巻き添えにしない
            console.error(`[Health Sync] ${key} failed:`, error);
            results[key] = { ok: false, error: 'Internal error' };
        }
    }

    return NextResponse.json({ success: anySuccess, results }, { status: anySuccess ? 200 : 500 });
}
