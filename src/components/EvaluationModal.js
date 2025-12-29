"use client";
import React, { useState, useEffect } from 'react';
import { X, Sparkles, Trophy, AlertTriangle, Info } from 'lucide-react';
import { evaluateDailyLog } from '@/app/actions';

export default function EvaluationModal({ data, onClose }) {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const runEvaluation = async () => {
            try {
                const res = await evaluateDailyLog(data);
                if (res.error) {
                    setError(true);
                } else {
                    setResult(res);
                }
            } catch (e) {
                console.error(e);
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        runEvaluation();
    }, [data]); // Run once when data is provided

    // Score Color
    const getScoreColor = (score) => {
        if (score >= 80) return '#48BB78'; // Green
        if (score >= 60) return '#ECC94B'; // Yellow
        return '#F56565'; // Red
    };

    return (
        <div className="fixed-overlay">
            <div className="glass-panel zoom-in" style={{ width: '90%', maxWidth: '400px', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>

                {/* Close Button */}
                <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', cursor: 'pointer', zIndex: 10, color: 'var(--text-secondary)' }}>
                    <X size={24} />
                </button>

                {/* --- LOADING STATE --- */}
                {loading && (
                    <div style={{ padding: '40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
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
                        <div style={{ background: `linear-gradient(135deg, ${getScoreColor(result.score)} 0%, ${getScoreColor(result.score)}aa 100%)`, padding: '30px 20px', textAlign: 'center', color: 'white' }}>
                            <div style={{ fontSize: '1rem', opacity: 0.9 }}>今日のスコア</div>
                            <div style={{ fontSize: '4rem', fontWeight: 800, lineHeight: 1 }}>{result.score}</div>
                            <div style={{ marginTop: '10px', fontSize: '1.2rem', fontWeight: 'bold' }}>{result.title}</div>
                        </div>

                        {/* Content */}
                        <div style={{ padding: '25px' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <h4 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                                    <Info size={18} color="var(--primary)" /> アドバイス
                                </h4>
                                <p style={{ lineHeight: 1.6, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                                    {result.advice}
                                </p>
                            </div>

                            {/* Gemini Badge */}
                            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                <Sparkles size={12} /> Analyzed by {result.model}
                            </div>
                        </div>
                    </>
                )}

                {/* --- ERROR STATE --- */}
                {!loading && error && (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                        <AlertTriangle size={40} color="#F56565" style={{ marginBottom: '15px' }} />
                        <p>評価の生成に失敗しました。<br />しばらく待ってから再度お試しください。</p>
                        <button className="btn-primary" onClick={onClose} style={{ marginTop: '20px' }}>閉じる</button>
                    </div>
                )}

            </div>
            <style jsx>{`
        .sparkle-spin { animation: spin 2s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
