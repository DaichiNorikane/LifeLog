"use client";
import React, { useState, useEffect } from 'react';
import { X, Trophy, AlertTriangle, Sparkles, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { generateMealRanking } from '@/app/actions';

export default function MealRankingModal({ meals, onClose }) {
    const [ranking, setRanking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [debugInfo, setDebugInfo] = useState("");

    useEffect(() => {
        const fetchRanking = async () => {
            setLoading(true);
            setDebugInfo(`受け取った食事数: ${meals?.length || 0}`);

            if (!meals || meals.length === 0) {
                setError(true);
                setErrorMessage("食事記録がありません。まずは食事を記録してください。");
                setLoading(false);
                return;
            }

            try {
                // Sanitize meals data for Server Action
                const sanitizedMeals = meals.map(m => ({
                    foodName: m.foodName || 'Unknown',
                    calories: m.calories || 0,
                    macros: m.macros || { protein: 0, fat: 0, carbs: 0 },
                    timestamp: typeof m.timestamp === 'object' && m.timestamp?.toDate
                        ? m.timestamp.toDate().toISOString()
                        : (m.timestamp || new Date().toISOString()),
                    mealType: m.mealType || 'unknown',
                    score: m.score
                }));

                setDebugInfo(prev => prev + `\nサニタイズ後: ${sanitizedMeals.length}件`);

                const res = await generateMealRanking(sanitizedMeals);

                setDebugInfo(prev => prev + `\nAI応答: ${JSON.stringify(res).substring(0, 200)}...`);

                if (res.error) {
                    setError(true);
                    setErrorMessage(res.error);
                } else {
                    setRanking(res);
                }
            } catch (e) {
                console.error(e);
                setError(true);
                setErrorMessage(e.message);
                setDebugInfo(prev => prev + `\nエラー: ${e.message}`);
            } finally {
                setLoading(false);
            }
        };

        fetchRanking();
    }, [meals]);

    const RankingItem = ({ item, rank, isBest }) => {
        if (!item) return null;

        const bgColor = isBest ? '#F0FFF4' : '#FFF5F5';
        const borderColor = isBest ? '#C6F6D5' : '#FED7D7';
        const textColor = isBest ? '#2F855A' : '#C53030';
        const subColor = isBest ? '#48BB78' : '#F56565';
        const Icon = isBest ? ThumbsUp : ThumbsDown;

        return (
            <div style={{
                background: bgColor,
                padding: '15px',
                borderRadius: '12px',
                border: `1px solid ${borderColor}`,
                marginBottom: '10px'
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: isBest ? '#48BB78' : '#F56565',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        flexShrink: 0
                    }}>
                        {rank}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '4px', color: textColor }}>
                            {item.foodName}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: subColor, marginBottom: '6px' }}>
                            {item.date} • {item.calories}kcal
                        </div>
                        <div style={{ fontSize: '0.85rem', lineHeight: 1.4, color: '#4A5568', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                            <Icon size={14} style={{ marginTop: '3px', flexShrink: 0, color: subColor }} />
                            <span>{item.reason}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed-overlay">
            <div className="glass-panel zoom-in" style={{
                width: '90%',
                maxWidth: '500px',
                maxHeight: '90vh',
                padding: '0',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
            }}>
                <button onClick={onClose} style={{
                    position: 'absolute',
                    top: '15px',
                    right: '15px',
                    background: 'rgba(0,0,0,0.5)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    zIndex: 50,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <X size={20} />
                </button>

                <div style={{
                    background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
                    padding: '30px 20px',
                    color: 'white'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Trophy size={28} /> Meal Ranking
                    </h2>
                    <p style={{ margin: '10px 0 0 0', opacity: 0.9, fontSize: '0.9rem' }}>
                        エレナが選ぶ、直近2週間のベスト3＆ワースト3
                    </p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#F7F9FC' }}>
                    {loading && (
                        <div style={{ padding: '60px 0', textAlign: 'center' }}>
                            <Loader2 size={40} color="#667EEA" style={{ animation: 'spin 1s linear infinite' }} />
                            <p style={{ color: '#718096', marginTop: '20px' }}>食事履歴からランキングを作成中...</p>
                        </div>
                    )}

                    {!loading && error && (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#E53E3E' }}>
                            <AlertTriangle size={40} style={{ marginBottom: '15px' }} />
                            <p>ランキングの作成に失敗しました。</p>
                            <p style={{ fontSize: '0.8rem', marginTop: '10px' }}>{errorMessage}</p>
                            {/* Debug info */}
                            <details style={{ marginTop: '20px', textAlign: 'left', fontSize: '0.7rem', color: '#718096' }}>
                                <summary>デバッグ情報</summary>
                                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{debugInfo}</pre>
                            </details>
                        </div>
                    )}

                    {!loading && ranking && (
                        <>
                            {/* Best 3 */}
                            <div style={{ marginBottom: '30px' }}>
                                <h3 style={{
                                    margin: '0 0 15px 0',
                                    color: '#48BB78',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '1.1rem'
                                }}>
                                    <Trophy size={20} /> ベスト3 🏆
                                </h3>
                                {ranking.best && ranking.best.length > 0 ? (
                                    ranking.best.map((item, idx) => (
                                        <RankingItem key={`best-${idx}`} item={item} rank={idx + 1} isBest={true} />
                                    ))
                                ) : (
                                    <p style={{ color: '#A0AEC0', textAlign: 'center', padding: '20px' }}>
                                        ベスト選出なし
                                    </p>
                                )}
                            </div>

                            {/* Worst 3 */}
                            <div style={{ marginBottom: '20px' }}>
                                <h3 style={{
                                    margin: '0 0 15px 0',
                                    color: '#F56565',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '1.1rem'
                                }}>
                                    <AlertTriangle size={20} /> ワースト3 💀
                                </h3>
                                {ranking.worst && ranking.worst.length > 0 ? (
                                    ranking.worst.map((item, idx) => (
                                        <RankingItem key={`worst-${idx}`} item={item} rank={idx + 1} isBest={false} />
                                    ))
                                ) : (
                                    <p style={{ color: '#A0AEC0', textAlign: 'center', padding: '20px' }}>
                                        ワースト選出なし
                                    </p>
                                )}
                            </div>

                            <div style={{ textAlign: 'center', marginTop: '30px', color: '#718096', fontSize: '0.8rem' }}>
                                <Sparkles size={12} style={{ marginRight: '4px' }} />
                                Analyzed by {ranking.model || 'AI'}
                            </div>
                        </>
                    )}
                </div>
            </div>
            <style jsx>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
