import { NextResponse } from 'next/server';
import {
    verifyWidgetToken, writeActivity, writeSleep, writeWeight, writeWorkouts,
} from '@/lib/health/ingest';
import { ACTIVITY_METRIC_MAP, BODY_METRIC_MAP } from '@/lib/health/healthMetrics';

/**
 * HealthKit まとめて受信API。
 *
 * ショートカットを機能ごとに分けると、ユーザーが作るオートメーションが5個になり
 * 現実的に設定しきれない。1本の POST で体組成・アクティビティ・ワークアウト・睡眠を全部受ける。
 *
 * 【重要】部分成功を許す。
 * 体脂肪が取れない日、ワークアウトが無い日は普通にある。
 * 1ドメインの失敗で全体を 400 にすると、取れているデータまで捨てることになる。
 *
 * 【重要】2つの書き方を受け付ける。
 *
 *   入れ子:  { uid, activity: { steps: 8421 }, weight: { weight: 82.6 } }
 *   平ら:    { uid, steps: 8421, weight: 82.6 }
 *
 * iOSショートカットのJSON入力は「キー・型・値」を1行ずつ登録する形式で、
 * 入れ子の辞書を作るには子エディタに潜る必要があり、実機での設定コストが高い。
 * 平らな形を許すと1行ずつの登録だけで済む。実際に設定してもらったところ
 * ここが最大の詰まりどころだったため、サーバー側で吸収する。
 */

const DOMAINS = [
    { key: 'weight', run: (uid, value) => writeWeight(uid, value) },
    { key: 'activity', run: (uid, value, capturedAt) => writeActivity(uid, { capturedAt, ...value }) },
    { key: 'workouts', run: (uid, value) => writeWorkouts(uid, value) },
    { key: 'sleep', run: (uid, value) => writeSleep(uid, value) },
];

const isPlainObject = (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** 平らに書ける睡眠のフィールド。sleepEnd があれば睡眠の記録として扱う */
const SLEEP_FIELDS = [
    'sleepStart', 'sleepEnd', 'inBedMinutes', 'asleepMinutes',
    'deepMinutes', 'remMinutes', 'awakenings',
];

/** 平らに置かれた指標を、入れ子の形に組み立て直す */
const collectFlatPayload = (body) => {
    const activity = {};
    const weight = {};
    const sleep = {};

    for (const [key, value] of Object.entries(body)) {
        // `weight` だけはドメイン名と指標名が衝突する。
        // オブジェクトなら入れ子指定、数値・文字列なら体重そのものとして扱う。
        if (isPlainObject(value)) continue;

        if (ACTIVITY_METRIC_MAP[key]) activity[key] = value;
        else if (BODY_METRIC_MAP[key]) weight[key] = value;
        else if (SLEEP_FIELDS.includes(key)) sleep[key] = value;
    }

    return {
        activity: Object.keys(activity).length > 0 ? activity : undefined,
        weight: weight.weight !== undefined ? weight : undefined,
        sleep: sleep.sleepEnd !== undefined ? sleep : undefined,
    };
};

/**
 * 入れ子指定を優先しつつ、平らな指定で補う。
 * 両方書かれていた場合は入れ子を採用する（明示的に書いたほうを信じる）。
 */
const normalizeBody = (body) => {
    const flat = collectFlatPayload(body);

    return {
        weight: isPlainObject(body.weight) ? body.weight : flat.weight,
        activity: body.activity !== undefined ? body.activity : flat.activity,
        workouts: body.workouts,
        sleep: isPlainObject(body.sleep) ? body.sleep : flat.sleep,
    };
};

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

    const payload = normalizeBody(body);

    const present = DOMAINS.filter(({ key }) => payload[key] !== undefined && payload[key] !== null);
    if (present.length === 0) {
        return NextResponse.json({ error: 'No data' }, { status: 400 });
    }

    const results = {};
    let anySuccess = false;

    for (const { key, run } of present) {
        try {
            const result = await run(uid, payload[key], capturedAt);
            if (result.ok) {
                anySuccess = true;
                const { ok, status, ...rest } = result;
                results[key] = { ok: true, ...rest };
            } else {
                // 失敗側も status 以外はそのまま返す。診断用の値（received 等）を
                // ここで落とすと、ショートカットの設定ミスが実機から追えなくなる
                const { ok, status, ...rest } = result;
                results[key] = { ok: false, ...rest };
            }
        } catch (error) {
            // 1ドメインの例外で他のドメインを巻き添えにしない
            console.error(`[Health Sync] ${key} failed:`, error);
            results[key] = { ok: false, error: 'Internal error' };
        }
    }

    return NextResponse.json({ success: anySuccess, results }, { status: anySuccess ? 200 : 500 });
}
