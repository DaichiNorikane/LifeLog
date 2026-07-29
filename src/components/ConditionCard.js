'use client';

import { Activity, ChevronRight, Moon } from 'lucide-react';
import { AXES, AXIS_LABELS, GRADES } from '@/lib/health/conditionRules';
import { hasAnyScore } from '@/lib/health/conditionEngine';

/**
 * ダッシュボードの4軸ミニゲージ。
 * 数値だけを並べず、必ず「なぜ」の一行を添える（責める表示にしない）。
 */
export default function ConditionCard({ result, onOpenDetail, needsBedtime = false, onRequestBedtime }) {
    if (!result) return null;

    const scored = hasAnyScore(result);

    return (
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Activity size={15} color="var(--primary)" /> 今日のコンディション予測
                </h3>
                {scored && (
                    <button
                        type="button"
                        onClick={onOpenDetail}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '2px', padding: '4px' }}
                    >
                        詳しく <ChevronRight size={13} />
                    </button>
                )}
            </div>

            {!scored ? (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                    まだ判定できません。記録が増えると見えてきますよ😊
                </p>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                        {AXES.map(axis => (
                            <AxisGauge key={axis} axis={axis} data={result.axes[axis]} />
                        ))}
                    </div>

                    {(result.topNegative || result.topPositive) && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '12px 0 0' }}>
                            {result.topNegative
                                ? `いちばん響いているのは「${result.topNegative.label}」です`
                                : `いちばん効いているのは「${result.topPositive.label}」です✨`}
                        </p>
                    )}
                </>
            )}

            {needsBedtime && (
                <button
                    type="button"
                    onClick={onRequestBedtime}
                    style={{
                        marginTop: '12px', width: '100%', padding: '9px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        fontSize: '0.72rem', cursor: 'pointer',
                        borderRadius: '10px', border: '1px dashed var(--border-subtle)',
                        background: 'transparent', color: 'var(--text-secondary)',
                    }}
                >
                    <Moon size={13} /> 就寝時刻を設定すると睡眠の判定ができます🌙
                </button>
            )}

            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '10px 0 0' }}>
                一般的な栄養学にもとづく推定です。医学的な診断ではありません。
            </p>
        </div>
    );
}

function AxisGauge({ axis, data }) {
    const { score, grade, confidence } = data || {};
    const hasScore = score !== null && score !== undefined;
    const color = hasScore ? GRADES[grade].color : 'var(--border-subtle)';
    const dim = confidence === 'low';

    return (
        <div style={{ textAlign: 'center', opacity: dim ? 0.65 : 1 }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                {AXIS_LABELS[axis]}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: hasScore ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1.2 }}>
                {hasScore ? score : '―'}
            </div>
            <div style={{ height: '4px', background: '#EDF2F7', borderRadius: '2px', overflow: 'hidden', marginTop: '5px' }}>
                <div style={{ width: hasScore ? `${score}%` : '0%', height: '100%', background: color, borderRadius: '2px', transition: 'width 0.5s ease' }} />
            </div>
            {dim && (
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '3px' }}>参考値</div>
            )}
        </div>
    );
}
