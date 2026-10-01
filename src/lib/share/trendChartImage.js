import { ImageResponse } from 'next/og';
import {
    buildLinePanel, formatShortDate, pickChartMetrics, SHARE_TREND_DAYS, trendStartDateId,
} from '@/lib/share/shareReport';

/**
 * 体重・体脂肪率・体年齢の推移グラフ（PNG）を描く。
 *
 * 画像生成AIは使わず、記録された数値から折れ線を描く。
 * next/og（Satori + resvg）で SVG を PNG にするので、追加の依存やネイティブモジュールは要らない。
 * 同梱フォントは日本語を持たないため、画像内の文字は英数字だけにしている。
 */
const WIDTH = 1080;
const PANEL_HEIGHT = 300;
const HEADER_HEIGHT = 110;
const PLOT_LEFT = 110;
const PLOT_RIGHT = 60;
const PLOT_TOP = 70;
const PLOT_BOTTOM = 50;
const DOT_PAD = 10;

const format = (value, decimals) => (value === null || value === undefined ? '-' : Number(value).toFixed(decimals));

const Panel = ({ metric, series, startDateId, endDateId }) => {
    const plotWidth = WIDTH - PLOT_LEFT - PLOT_RIGHT;
    const plotHeight = PANEL_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
    const panel = buildLinePanel(series, metric.key, {
        width: plotWidth, height: plotHeight, startDateId, endDateId,
    });
    const unit = metric.unit ? ` ${metric.unit}` : '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: WIDTH, height: PANEL_HEIGHT, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', position: 'absolute', left: PLOT_LEFT, top: 14 }}>
                <div style={{ display: 'flex', fontSize: 30, color: '#334155' }}>{metric.label}</div>
                <div style={{ display: 'flex', fontSize: 36, color: metric.color, marginLeft: 20 }}>
                    {`${format(panel.last?.value, metric.decimals)}${unit}`}
                </div>
            </div>

            {/* 縦軸の上端・下端の値 */}
            <div style={{ display: 'flex', position: 'absolute', left: 0, width: PLOT_LEFT - 16, top: PLOT_TOP - 14, justifyContent: 'flex-end', fontSize: 22, color: '#94a3b8' }}>
                {format(panel.max, metric.decimals)}
            </div>
            <div style={{ display: 'flex', position: 'absolute', left: 0, width: PLOT_LEFT - 16, top: PLOT_TOP + plotHeight - 14, justifyContent: 'flex-end', fontSize: 22, color: '#94a3b8' }}>
                {format(panel.min, metric.decimals)}
            </div>

            {/* 端の点が切れないよう、描画領域の外側に DOT_PAD だけ余白を持たせる */}
            <svg
                width={plotWidth + DOT_PAD * 2}
                height={plotHeight + DOT_PAD * 2}
                viewBox={`${-DOT_PAD} ${-DOT_PAD} ${plotWidth + DOT_PAD * 2} ${plotHeight + DOT_PAD * 2}`}
                style={{ position: 'absolute', left: PLOT_LEFT - DOT_PAD, top: PLOT_TOP - DOT_PAD }}
            >
                <line x1="0" y1="0" x2={plotWidth} y2="0" stroke="#e2e8f0" strokeWidth="2" />
                <line x1="0" y1={plotHeight / 2} x2={plotWidth} y2={plotHeight / 2} stroke="#f1f5f9" strokeWidth="2" />
                <line x1="0" y1={plotHeight} x2={plotWidth} y2={plotHeight} stroke="#e2e8f0" strokeWidth="2" />
                {panel.segments.map((segment, i) => (
                    <polyline
                        key={`l${i}`}
                        points={segment.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={metric.color}
                        strokeWidth="5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                ))}
                {panel.segments.flat().map((p, i) => (
                    <circle key={`c${i}`} cx={p.x} cy={p.y} r="6" fill={metric.color} />
                ))}
            </svg>

            <div style={{ display: 'flex', position: 'absolute', left: PLOT_LEFT, top: PLOT_TOP + plotHeight + 10, fontSize: 22, color: '#94a3b8' }}>
                {formatShortDate(startDateId)}
            </div>
            <div style={{ display: 'flex', position: 'absolute', right: PLOT_RIGHT, top: PLOT_TOP + plotHeight + 10, fontSize: 22, color: '#94a3b8' }}>
                {formatShortDate(endDateId)}
            </div>
        </div>
    );
};

export const renderTrendChart = (series, endDateId, days = SHARE_TREND_DAYS) => {
    const startDateId = trendStartDateId(endDateId, days);
    const metrics = pickChartMetrics(series);
    const height = HEADER_HEIGHT + Math.max(metrics.length, 1) * PANEL_HEIGHT;

    return new ImageResponse(
        (
            <div style={{ display: 'flex', flexDirection: 'column', width: WIDTH, height, background: '#ffffff' }}>
                <div style={{ display: 'flex', alignItems: 'center', height: HEADER_HEIGHT, paddingLeft: PLOT_LEFT, fontSize: 34, color: '#0f172a', borderBottom: '2px solid #e2e8f0' }}>
                    {`Body trend  ${formatShortDate(startDateId)} - ${formatShortDate(endDateId)}`}
                </div>
                {metrics.length === 0 ? (
                    <div style={{ display: 'flex', height: PANEL_HEIGHT, alignItems: 'center', justifyContent: 'center', fontSize: 30, color: '#94a3b8' }}>
                        No data
                    </div>
                ) : metrics.map(metric => (
                    <Panel key={metric.key} metric={metric} series={series} startDateId={startDateId} endDateId={endDateId} />
                ))}
            </div>
        ),
        {
            width: WIDTH,
            height,
            headers: { 'Cache-Control': 'private, max-age=300' },
        },
    );
};

