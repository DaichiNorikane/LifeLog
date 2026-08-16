import { NextResponse } from 'next/server';
import { verifyWidgetToken, writeActivity } from '@/lib/health/ingest';

// HealthKit（iOSショートカット経由）からの日次アクティビティ受信API。
// 認証・日付キーの扱いは /api/health/weight と同じ方式に揃えている。

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
        const result = await writeActivity(uid, payload);
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: result.status || 400 });
        }
        return NextResponse.json({
            success: true,
            date: result.date,
            metrics: result.metrics,
            ...(result.rejected ? { rejected: result.rejected } : {}),
        });
    } catch (error) {
        console.error('[Health Activity] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
