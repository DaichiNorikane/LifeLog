import { NextResponse } from 'next/server';
import { verifyWidgetToken, writeWeight } from '@/lib/health/ingest';

// HealthKit（iOSショートカット経由）からの体組成データ受信API。
// eufy 体組成計 → EufyLife → Apple ヘルスケア → ショートカット、という経路で届く。
// 手順は docs/eufy-healthkit-setup.md を参照。

export async function POST(request) {
    if (!verifyWidgetToken(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
        body = await request.json();
    } catch (error) {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { uid, ...payload } = body || {};

    if (!uid) {
        return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    try {
        const result = await writeWeight(uid, payload);
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: result.status || 400 });
        }

        const { ok, ...values } = result;
        return NextResponse.json({ success: true, ...values });
    } catch (error) {
        console.error('[Health Weight] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
