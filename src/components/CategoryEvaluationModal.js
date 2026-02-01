"use client";
import React, { useState, useEffect } from 'react';
import { X, Sparkles, Utensils, AlertTriangle, Loader2 } from 'lucide-react';
import { evaluateMealCategory } from '@/app/actions';

export default function CategoryEvaluationModal({ category, meals, onClose, stockItems = [], savedResult, onSave }) {
    const [result, setResult] = useState(savedResult || null);
    const [loading, setLoading] = useState(!savedResult);
    const [error, setError] = useState(false);

    // Map category to Japanese label and color
    const config = {
        breakfast: { label: '朝食', color: '#F6AD55' },
        lunch: { label: '昼食', color: '#68D391' },
        dinner: { label: '夕食', color: '#805AD5' },
        snack: { label: '間食', color: '#FC8181' }
    }[category] || { label: '食事', color: '#CBD5E0' };

    // Filter meals for this category
    const categoryMeals = meals.filter(m => (m.mealType || 'snack') === category);

    const runEvaluation = async () => {
        setLoading(true);
        setError(false);
        try {
            // Context data
            const dailyConsumed = meals.reduce((sum, m) => sum + (m.calories || 0), 0);

            const res = await evaluateMealCategory(
                category,
                categoryMeals,
                { targetCalories: 2200, consumedCalories: dailyConsumed }
            );

            if (res.error) {
                setError(true);
            } else {
                setResult(res);
                if (onSave) onSave(res);
            }
        } catch (e) {
            console.error(e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!savedResult) {
            runEvaluation();
        }
    }, [meals, category]);

    const evalData = result; // Direct result from action


    // Filter meals for this category to display
    // categoryMeals is already defined above


    return (
        <div className="fixed-overlay">
            <div className="glass-panel zoom-in" style={{ width: '90%', maxWidth: '360px', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', background: 'white', borderRadius: '20px' }}>

                {/* Header */}
                <div style={{ background: `linear-gradient(135deg, ${config.color} 0%, ${config.color}dd 100%)`, padding: '20px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '1.2rem' }}>
                        <Utensils size={20} /> {config.label}の評価
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button onClick={runEvaluation} style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '20px', padding: '4px 10px', cursor: 'pointer', color: 'white', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Sparkles size={12} /> 再評価
                        </button>
                        <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.2)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div style={{ padding: '25px', minHeight: '200px' }}>

                    {/* Loading */}
                    {loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '15px' }}>
                            <Loader2 className="spin" size={32} color={config.color} />
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>エレナが評価中...</p>
                        </div>
                    )}

                    {/* Error */}
                    {!loading && error && (
                        <div style={{ textAlign: 'center', color: '#F56565', padding: '20px' }}>
                            <AlertTriangle size={32} style={{ marginBottom: '10px' }} />
                            <p>評価できませんでした。</p>
                        </div>
                    )}

                    {/* Content */}
                    {!loading && result && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Score */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)', padding: '15px', borderRadius: '12px' }}>
                                <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>スコア</span>
                                {evalData && typeof evalData.score === 'number' ? (
                                    <span style={{ fontSize: '2rem', fontWeight: 800, color: evalData.score >= 8 ? '#48BB78' : (evalData.score <= 3 ? '#F56565' : '#ECC94B') }}>
                                        {evalData.score}<span style={{ fontSize: '1rem', fontWeight: 500 }}>点</span>
                                    </span>
                                ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>記録なし</span>
                                )}
                            </div>

                            {/* Comment */}
                            {evalData && evalData.comment && (
                                <div>
                                    <div style={{ fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                                        <Sparkles size={16} color={config.color} /> エレナからのコメント
                                    </div>
                                    <div style={{ lineHeight: 1.6, color: 'var(--text-secondary)', fontSize: '0.95rem', background: '#F7FAFC', padding: '15px', borderRadius: '12px', borderLeft: `3px solid ${config.color}` }}>
                                        {evalData.comment}
                                    </div>
                                </div>
                            )}

                            {/* Advice (Detailed) */}
                            {evalData && evalData.advice && (
                                <div>
                                    <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                        アドバイス
                                    </div>
                                    <div style={{ lineHeight: 1.6, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                        {evalData.advice}
                                    </div>
                                </div>
                            )}

                            {/* Menu List (Context) */}
                            {categoryMeals.length > 0 && (
                                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '15px' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>記録されたメニュー</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {categoryMeals.map((m, i) => (
                                            <span key={i} style={{ background: 'white', border: '1px solid var(--border-subtle)', padding: '4px 10px', borderRadius: '15px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {m.foodName}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!evalData && !loading && (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    この区分の評価データがありません。
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <style jsx>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
             `}</style>
        </div>
    );
}
