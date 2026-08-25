import { NextResponse } from 'next/server';
import { verifyWidgetToken, writeSleep } from '@/lib/health/ingest';

// HealthKit（iOSショートカット経由）からの睡眠データ受信API。
// 認証・日付キーの扱いは /api/health/weight と同じ方式に揃えている。
// 保存先の日付は「その睡眠を引き起こした食事の日」＝起床日の前日。

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

    const { uid, ...payload } = body || {};

    if (!uid) {
        return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    try {
        const result = await writeSleep(uid, payload);
        if (!result.ok) {
            const { ok, status, ...rest } = result;
            return NextResponse.json(rest, { status: status || 400 });
        }
        // warning / hint は「就寝時刻を別の夜のものと判断して捨てた」ときだけ付く。
        // 落とすと就寝時刻が消えた理由が実機から分からなくなるので、そのまま通す
        const { ok, status, date, sleep, ...diagnostics } = result;
        return NextResponse.json({ success: true, date, sleep, ...diagnostics });
    } catch (error) {
        console.error('[Health Sleep] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
