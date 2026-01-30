"use client";
import React, { useState, useEffect } from 'react';
import { X, Sparkles, Trophy, AlertTriangle, Info } from 'lucide-react';
import { evaluateDailyLog } from '@/app/actions';

export default function EvaluationModal({ data, onClose, onEvaluationComplete, savedResult, onSave, stockItems = [], isToday = true, dateLabel = '' }) {
    const [result, setResult] = useState(savedResult || null);
    const [loading, setLoading] = useState(!savedResult);
    const [error, setError] = useState(false);

    // Run evaluation function
    const runEvaluation = async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await evaluateDailyLog(data, stockItems);
            if (res.error) {
                setError(true);
            } else {
                setResult(res);
                if (onSave) onSave(res); // Persist to parent
                if (onEvaluationComplete) onEvaluationComplete(res); // Update meals
            }
        } catch (e) {
            console.error(e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Only run if no saved result exists
        if (!savedResult) {
            runEvaluation();
        }
    }, []); // Run once on mount if needed

    // Score Color
    const getScoreColor = (score) => {
        if (score >= 80) return '#48BB78'; // Green
        if (score >= 60) return '#ECC94B'; // Yellow
        return '#F56565'; // Red
    };

    return (
        <div className="fixed-overlay">
            <div className="glass-panel zoom-in" style={{ width: '90%', maxWidth: '400px', maxHeight: '85vh', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>

                {/* Close Button - FIXED POSITION relative to modal container */}
                <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', zIndex: 50, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} />
                </button>

                {/* Content Container - Scrollable */}
                <div style={{ overflowY: 'auto', flex: 1, position: 'relative', paddingBottom: '20px' }}>

                    {/* --- LOADING STATE --- */}
                    {loading && (
                        <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            <div className="sparkle-spin">
                                <Sparkles size={48} color="var(--primary)" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, color: 'var(--primary)' }}>AI専属コーチが分析中...</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                                    栄養バランス、カロリー、食事タイミングを<br />総合的に評価しています
                                </p>
                            </div>
                        </div>
                    )}

                    {/* --- RESULT STATE --- */}
                    {!loading && result && (
                        <>
                            {/* Header / Score */}
                            <div style={{ background: `linear-gradient(135deg, ${getScoreColor(result.score)} 0%, ${getScoreColor(result.score)}aa 100%)`, padding: '40px 20px 30px', color: 'white', position: 'relative', overflow: 'hidden', textAlign: 'left' }}>

                                {/* Character Image (Absolute) */}
                                <img
                                    src={(() => {
                                        const s = result.score;
                                        if (s === 100) return "/images/elena/elena_score_100.png";
                                        if (s >= 90) return "/images/elena/elena_score_90_99.png";
                                        if (s >= 75) return "/images/elena/elena_score_75_90.png";
                                        if (s >= 50) return "/images/elena.png"; // Normal 50-74
                                        if (s >= 20) return "/images/elena/elena_score_20_50.png";
                                        return "/images/elena/elena_score_0_20.png";
                                    })()}
                                    alt="Elena"
                                    style={{
                                        position: 'absolute',
                                        bottom: '-10px',
                                        right: '-20px',
                                        width: '280px',
                                        height: 'auto',
                                        zIndex: 0,
                                        opacity: 1,
                                        pointerEvents: 'none',
                                    }}
                                />

                                {/* Content (Relative with Z-Index) */}
                                <div style={{ position: 'relative', zIndex: 1, paddingRight: '20px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                                    {/* Status Icon & Label */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                        <div style={{ fontSize: '1.5rem', background: 'rgba(255,255,255,0.2)', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {(() => {
                                                const status = result.characterStatus || '';
                                                if (status.includes('SCOLD') || status.includes('STRICT')) return '⚡';
                                                if (status.includes('LOGIC') || status.includes('ANALYSIS')) return '📉';
                                                if (status.includes('CHEER') || status.includes('APPROVAL')) return '✨';
                                                if (status.includes('ENCOURAGE')) return '🔥';
                                                return '📋';
                                            })()}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                            Elena's Eye
                                        </div>
                                    </div>

                                    <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>{isToday ? '今日のスコア' : `${dateLabel}のスコア`}</div>
                                    <div style={{ fontSize: '3.5rem', fontWeight: 800, lineHeight: 1, margin: '5px 0' }}>{result.score}</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', lineHeight: 1.4 }}>{result.title}</div>

                                    {/* Re-eval Button */}
                                    {isToday && (
                                        <button onClick={runEvaluation} style={{ marginTop: '15px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.5)', color: 'white', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <Sparkles size={12} /> 再評価
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Content */}
                            <div style={{ padding: '25px' }}>
                                <div style={{ marginBottom: '20px' }}>
                                    <h4 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                                        <Info size={18} color="var(--primary)" /> アドバイス
                                    </h4>
                                    <div style={{ lineHeight: 1.8, color: 'var(--text-secondary)', fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>
                                        {/* Simple parser for **bold** text */}
                                        {String(result.advice || '').split(/(\*\*.*?\*\*)/).map((part, index) => {
                                            if (part.startsWith('**') && part.endsWith('**')) {
                                                return <strong key={index} style={{ color: 'var(--primary)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
                                            }
                                            return part;
                                        })}
                                    </div>
                                </div>

                                {/* Suggestions Section */}
                                {result.suggestions && result.suggestions.length > 0 && (
                                    <div style={{ marginBottom: '20px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                                        <h4 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                                            <Sparkles size={18} color="#F59E0B" /> {result.mealCategory || '次の食事提案'}
                                        </h4>
                                        {result.detectedContext && (
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px', background: 'var(--bg-card)', padding: '8px 12px', borderRadius: '8px' }}>
                                                {result.detectedContext}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {result.suggestions.map((item, idx) => (
                                                <div key={idx} style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--text-primary)' }}>{item.name}</div>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>{item.reason}</div>
                                                    {item.calories && <div style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '6px', fontWeight: 600 }}>約{item.calories}kcal</div>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Gemini Badge */}
                                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                    <Sparkles size={12} /> Analyzed by {result.model}
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- ERROR STATE --- */}
                    {!loading && error && (
                        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                            <AlertTriangle size={40} color="#F56565" style={{ marginBottom: '15px' }} />
                            <p>評価の生成に失敗しました。<br />しばらく待ってから再度お試しください。</p>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
                                <button className="btn-primary" onClick={onClose} style={{ background: 'var(--bg-main)', color: 'var(--text-secondary)' }}>閉じる</button>
                                <button className="btn-primary" onClick={runEvaluation}>再試行</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <style jsx>{`
        .sparkle-spin { animation: spin 2s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
