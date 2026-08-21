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
        return NextResponse.json({ success: true, date: result.date, sleep: result.sleep });
    } catch (error) {
        console.error('[Health Sleep] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
