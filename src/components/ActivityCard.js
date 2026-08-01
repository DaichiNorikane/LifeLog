'use client';

import { useState } from 'react';
import {
    Activity, ChevronDown, ChevronUp, Dumbbell, Flame, Footprints, Moon, Scale,
} from 'lucide-react';
import {
    ACTIVITY_METRICS, BODY_METRICS, calcFatMass, formatMetric, roundMetric,
} from '@/lib/health/healthMetrics';

/**
 * iPhone のヘルスケアから届いた「実測値」を出すカード。
 *
 * コンディションカード（予測）の真下に置く。予測 → 実測 の順に並ぶことで、
 * 「エレナの読みは当たっていたか」が同じ画面で確かめられる。
 *
 * 表示ルール（拡張栄養素カードと同じ）:
 *   - null（未取得）は「―」。0（実際にゼロ）はそのまま 0 と出す。両者を混同しない。
 *   - 何ひとつデータが無い日は、カードごと出さない。空の枠は情報量ゼロで邪魔になるだけ。
 */

const hasValue = (v) => v !== null && v !== undefined;

const formatSleepDuration = (minutes) => {
    if (!hasValue(minutes)) return null;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}時間${m}分` : `${m}分`;
};

const formatClock = (iso) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
    }).format(date);
};

export default function ActivityCard({
    activity = null,
    body = null,
    sleep = null,
    sleepLabel = '昨夜の睡眠',
    workouts = [],
    title = '今日のからだ',
}) {
    const [expanded, setExpanded] = useState(false);

    const primaryMetrics = ACTIVITY_METRICS
        .filter(m => m.primary && hasValue(activity?.[m.key]));
    const secondaryMetrics = ACTIVITY_METRICS
        .filter(m => !m.primary && hasValue(activity?.[m.key]));

    const bodyMetrics = BODY_METRICS
        .filter(m => m.primary && hasValue(body?.[m.key]));
    const fatMass = calcFatMass(body?.weight, body?.bodyFat);

    const asleep = formatSleepDuration(sleep?.asleepMinutes ?? sleep?.inBedMinutes);
    const sleepRange = sleep?.sleepStart && sleep?.sleepEnd
        ? `${formatClock(sleep.sleepStart)} → ${formatClock(sleep.sleepEnd)}`
        : null;

    const hasAnything = primaryMetrics.length > 0 || secondaryMetrics.length > 0
        || bodyMetrics.length > 0 || Boolean(asleep) || workouts.length > 0;

    // 何も届いていない日はカードごと非表示（ConditionCard と同じ流儀）
    if (!hasAnything) return null;

    return (
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Activity size={15} color="var(--primary)" /> {title}
                </h3>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ヘルスケア連携</span>
            </div>

            {/* 動いた量 */}
            {primaryMetrics.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(primaryMetrics.length, 4)}, 1fr)`, gap: '8px' }}>
                    {primaryMetrics.map(metric => (
                        <MetricTile key={metric.key} metric={metric} value={activity[metric.key]} />
                    ))}
                </div>
            )}

            {/* 睡眠（実測）。ここが出ないと HealthKit 連携が動いているか分からない */}
            {asleep && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    <Moon size={14} color="#7C3AED" />
                    <span style={{ color: 'var(--text-secondary)' }}>{sleepLabel}</span>
                    <strong>{asleep}</strong>
                    {sleepRange && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{sleepRange}</span>}
                </div>
            )}

            {/* ワークアウト */}
            {workouts.length > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {workouts.map(w => (
                        <div key={w.id || w.start} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                            <Dumbbell size={14} color="#059669" />
                            <strong>{w.typeLabel || w.type}</strong>
                            <span style={{ color: 'var(--text-secondary)' }}>{w.durationMinutes}分</span>
                            {hasValue(w.distanceKm) && <span style={{ color: 'var(--text-secondary)' }}>{roundMetric('distanceKm', w.distanceKm)}km</span>}
                            {hasValue(w.activeEnergy) && <span style={{ color: '#EA580C' }}>{Math.round(w.activeEnergy)}kcal</span>}
                        </div>
                    ))}
                </div>
            )}

            {/* 体組成（eufy 体組成計 → ヘルスケア → ここ）*/}
            {bodyMetrics.length > 0 && (
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <Scale size={13} color="#DB2777" /> 体組成
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: '0.8rem' }}>
                        {bodyMetrics.map(metric => (
                            <span key={metric.key} style={{ color: 'var(--text-primary)' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginRight: '4px' }}>{metric.label}</span>
                                <strong>{formatMetric(metric.key, body[metric.key])}</strong>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{metric.unit}</span>
                            </span>
                        ))}
                        {hasValue(fatMass) && (
                            // 体組成計は「率」しか送ってこないが、減量で見たいのは「脂肪が何kg減ったか」
                            <span style={{ color: 'var(--text-primary)' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginRight: '4px' }}>体脂肪量</span>
                                <strong>{fatMass}</strong>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>kg</span>
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* 副次的な指標は畳んでおく（歩行速度や歩幅は毎日見るものではない） */}
            {secondaryMetrics.length > 0 && (
                <>
                    <button
                        type="button"
                        onClick={() => setExpanded(v => !v)}
                        style={{
                            marginTop: '12px', background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-secondary)', fontSize: '0.72rem', padding: '4px 0',
                            display: 'flex', alignItems: 'center', gap: '4px',
                        }}
                    >
                        {expanded ? 'とじる' : 'ほかの記録'} {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {expanded && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: '0.78rem', marginTop: '4px' }}>
                            {secondaryMetrics.map(metric => (
                                <span key={metric.key} style={{ color: 'var(--text-primary)' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginRight: '4px' }}>{metric.label}</span>
                                    <strong>{formatMetric(metric.key, activity[metric.key])}</strong>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{metric.unit}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function MetricTile({ metric, value }) {
    const Icon = metric.key === 'steps' ? Footprints
        : metric.key === 'activeEnergy' ? Flame
            : metric.key === 'exerciseMinutes' ? Dumbbell
                : Activity;

    return (
        <div style={{ textAlign: 'center' }}>
            <Icon size={14} color="var(--primary)" style={{ marginBottom: '2px' }} />
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {formatMetric(metric.key, value)}
                <span style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '2px' }}>{metric.unit}</span>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{metric.label}</div>
        </div>
    );
}
