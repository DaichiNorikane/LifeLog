import React, { useState, useEffect } from 'react';
import { X, Loader2, Sparkles, Utensils, Search } from 'lucide-react';
import { suggestNextMeal } from '@/app/actions';

export default function AdvisorModal({ history, dailyLog, targetType, onClose, onSuggestionClick, stockItems = [], savedState, onSave }) {
    const [suggestions, setSuggestions] = useState(savedState?.suggestions || []);
    const [advice, setAdvice] = useState(savedState?.advice || '');
    const [loading, setLoading] = useState(!savedState?.suggestions?.length);

    const fetchAdvice = async () => {
        setLoading(true);
        // Limit history to last 10 unique items to save tokens/complexity
        const uniqueHistory = [];
        const seen = new Set();
        for (const h of history) {
            if (!seen.has(h.foodName)) {
                uniqueHistory.push(h);
                seen.add(h.foodName);
            }
            if (uniqueHistory.length >= 10) break;
        }

        const result = await suggestNextMeal(uniqueHistory, dailyLog, targetType, stockItems);
        setSuggestions(result.suggestions || []);
        setAdvice(result.advice || "アドバイスを取得できませんでした。");

        // Save state
        if (onSave) {
            onSave({ suggestions: result.suggestions || [], advice: result.advice, targetType });
        }

        setLoading(false);
    };

    useEffect(() => {
        // Run only if no saved state or target type changed
        if (!savedState?.suggestions?.length || savedState.targetType !== targetType) {
            fetchAdvice();
        }
    }, []);

    return (
        <div className="fixed-overlay" style={{ zIndex: 1100 }}>
            <div className="glass-panel zoom-in" style={{ width: '90%', maxWidth: '500px', maxHeight: '85vh', padding: '0', position: 'relative', display: 'flex', flexDirection: 'column' }}>

                {/* Header */}
                <div style={{ padding: '20px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderTopLeftRadius: '20px', borderTopRightRadius: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Sparkles size={20} /> AI 食事アドバイザー ({
                            { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' }[targetType] || '食事'
                        })
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={fetchAdvice} disabled={loading} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                            <Sparkles size={16} />
                        </button>
                        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div style={{ padding: '25px', minHeight: '300px', overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '15px', color: 'var(--text-muted)' }}>
                            <Loader2 className="spin" size={40} color="var(--primary)" />
                            <p>あなたの栄養状態を分析中...</p>
                        </div>
                    ) : (
                        <div className="fade-in">
                            {/* Overall Advice */}
                            <div style={{ marginBottom: '25px', padding: '15px', background: '#eef2ff', borderRadius: '12px', borderLeft: '4px solid #6366f1', color: '#3730a3', lineHeight: '1.6' }}>
                                <span style={{ fontWeight: 'bold' }}>💡 アドバイス:</span> {advice}
                            </div>

                            <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>おすすめのメニュー</h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {suggestions.map((item, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => onSuggestionClick && onSuggestionClick(item.name)}
                                        style={{ display: 'flex', alignItems: 'flex-start', gap: '15px', padding: '15px', background: 'white', border: '1px solid var(--border-subtle)', borderRadius: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.03)', cursor: 'pointer', transition: 'transform 0.1s' }}
                                        className="hover-card"
                                    >
                                        <div style={{ background: '#f3f4f6', padding: '10px', borderRadius: '8px', color: 'var(--text-secondary)' }}>
                                            <Utensils size={20} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 'bold', fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                {item.name} <Search size={14} color="var(--primary)" />
                                            </div>
                                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{item.reason}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
