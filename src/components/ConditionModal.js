'use client';

import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { AXES, AXIS_LABELS, AXIS_DESCRIPTIONS, GRADES, CONFIDENCE_LABELS } from '@/lib/health/conditionRules';

/**
 * コンディションの内訳。
 * 「なぜこの点数なのか」をドライバー単位で必ず開示する（AI の言い訳に頼らない）。
 */
export default function ConditionModal({ isOpen, result, onClose }) {
    if (!isOpen || !result) return null;

    return (
        <div
            className="modal-overlay"
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
        >
            <div
                className="glass-panel"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: '560px', maxHeight: '85vh', overflowY: 'auto',
                    borderRadius: '20px 20px 0 0', padding: '20px',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                        コンディションの内訳
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="閉じる"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '4px' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {AXES.map(axis => (
                        <AxisSection key={axis} axis={axis} data={result.axes[axis]} />
                    ))}
                </div>

                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '18px 0 0' }}>
                    ここに出ている数値は、食事内容と時刻から機械的に計算した予測です。
                    一般的な栄養学にもとづく推定であり、医学的な診断ではありません。
                    体調が続けて優れないときは、お医者さんに相談してくださいね。
                </p>
            </div>
        </div>
    );
}

function AxisSection({ axis, data }) {
    const { score, grade, confidence, drivers = [] } = data || {};
    const hasScore = score !== null && score !== undefined;
    const badge = CONFIDENCE_LABELS[confidence];

    return (
        <section style={{ background: 'var(--bg-main)', borderRadius: '12px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '2px' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{AXIS_LABELS[axis]}</h3>
                {hasScore ? (
                    <>
                        <span style={{ fontSize: '1.15rem', fontWeight: 700, color: GRADES[grade].color }}>{score}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{GRADES[grade].label}</span>
                    </>
                ) : (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>まだ判定できません</span>
                )}
                {badge && (
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '1px 6px' }}>
                        {badge}
                    </span>
                )}
            </div>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                {AXIS_DESCRIPTIONS[axis]}
            </p>

            {!hasScore ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                    記録が増えると判定できるようになります😊
                </p>
            ) : drivers.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                    特に大きな要因はありません。標準的な一日です👍
                </p>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {drivers.map(d => (
                        <li key={d.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
                            <span style={{ display: 'flex', color: d.delta > 0 ? '#68D391' : '#FC8181' }}>
                                {d.delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                            </span>
                            <span style={{ flex: 1, color: 'var(--text-primary)' }}>
                                {d.label}
                                {d.detail && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>（{d.detail}）</span>
                                )}
                            </span>
                            <span style={{ fontWeight: 700, color: d.delta > 0 ? '#68D391' : '#FC8181' }}>
                                {d.delta > 0 ? `+${d.delta}` : d.delta}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
