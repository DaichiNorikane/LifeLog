import { NextResponse } from 'next/server';
import { getJstDateId } from '@/lib/firebase/adminHelpers';
import { buildTrendSeries } from '@/lib/share/shareReport';
import { getShareWeightsAdmin } from '@/lib/share/shareReportAdmin';
import { verifyShareChartParams } from '@/lib/share/shareToken';
import { renderTrendChart } from '@/lib/share/trendChartImage';

/**
 * 共有用の推移グラフ（PNG）。
 * LINE の画像メッセージとアプリ内の共有パネルの両方がこの URL を参照する。
 * 認証は URL の署名（shareToken.js）。Firebase Admin を使うので Node ランタイム。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const params = request.nextUrl.searchParams;
    const query = { uid: params.get('uid'), exp: params.get('exp'), sig: params.get('sig') };
    if (!verifyShareChartParams(query)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // date はアプリで過去の日を見ているとき用。署名の対象外なので、未来日は今日に丸める
        const today = getJstDateId(new Date());
        const requested = params.get('date');
        const dateId = /^\d{4}-\d{2}-\d{2}$/.test(requested || '') && requested < today ? requested : today;
        const weights = await getShareWeightsAdmin(query.uid, dateId);
        return renderTrendChart(buildTrendSeries(weights, dateId), dateId);
    } catch (e) {
        console.error('Share chart rendering failed:', e);
        return NextResponse.json({ error: 'Failed to render chart' }, { status: 500 });
    }
}
