import { NextResponse } from 'next/server';
import { verifyWidgetToken, writeWorkouts } from '@/lib/health/ingest';

// HealthKit（iOSショートカット経由）からのワークアウト受信API。
// 単体でも配列でも受ける（ショートカットの作り方で両方ありえるため）。
// 同じワークアウトを何度送っても重複しない（ドキュメントIDが冪等キー）。

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

    const { uid, workouts, ...single } = body || {};
    if (!uid) {
        return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    const list = workouts !== undefined ? workouts : single;

    try {
        const result = await writeWorkouts(uid, list);
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: result.status || 400 });
        }
        return NextResponse.json({
            success: true,
            written: result.written,
            skipped: result.skipped,
            dates: result.dates,
        });
    } catch (error) {
        console.error('[Health Workout] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
