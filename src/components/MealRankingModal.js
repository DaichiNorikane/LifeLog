"use client";
import React, { useState, useEffect } from 'react';
import { X, Trophy, AlertTriangle, Sparkles, Utensils, ThumbsUp, ThumbsDown } from 'lucide-react';
import { generateMealRanking } from '@/app/actions';

export default function MealRankingModal({ meals, onClose }) {
    const [ranking, setRanking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        const fetchRanking = async () => {
            setLoading(true);
            try {
                // Sanitize meals data for Server Action
                // Ensure no complex objects like Firestore Timestamps are passed
                const sanitizedMeals = meals.map(m => ({
                    foodName: m.foodName,
                    calories: m.calories,
                    macros: m.macros,
                    timestamp: typeof m.timestamp === 'object' ? m.timestamp.toDate().toISOString() : m.timestamp,
                    mealType: m.mealType,
                    score: m.score
                }));

                const res = await generateMealRanking(sanitizedMeals);
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
            } finally {
                setLoading(false);
            }
        };

        fetchRanking();
    }, [meals]);

    const RenderRankingCard = ({ type, data }) => {
        if (!data) return null;
        const { best, worst } = data;
        const label = { breakfast: '朝食', lunch: '昼食', dinner: '夕食' }[type];
        const color = { breakfast: '#F6AD55', lunch: '#68D391', dinner: '#805AD5' }[type];

        return (
            <div style={{ marginBottom: '30px', background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: '0 0 15px 0', color: color, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem' }}>
                    <Utensils size={20} /> {label}部門
                </h3>

                {/* Best */}
                <div style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#48BB78', fontWeight: 'bold', marginBottom: '8px' }}>
                        <Trophy size={18} /> Best Selection
                    </div>
                    <div style={{ background: '#F0FFF4', padding: '15px', borderRadius: '12px', border: '1px solid #C6F6D5' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '5px', color: '#2F855A' }}>{best.foodName}</div>
                        <div style={{ fontSize: '0.85rem', color: '#48BB78', marginBottom: '8px' }}>{best.date}</div>
                        <div style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#276749' }}>
                            <span style={{ marginRight: '6px' }}>👍</span>{best.reason}
                        </div>
                    </div>
                </div>

                {/* Worst */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F56565', fontWeight: 'bold', marginBottom: '8px' }}>
                        <AlertTriangle size={18} /> Worst Selection
                    </div>
                    <div style={{ background: '#FFF5F5', padding: '15px', borderRadius: '12px', border: '1px solid #FED7D7' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '5px', color: '#C53030' }}>{worst.foodName}</div>
                        <div style={{ fontSize: '0.85rem', color: '#F56565', marginBottom: '8px' }}>{worst.date}</div>
                        <div style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#9B2C2C' }}>
                            <span style={{ marginRight: '6px' }}>👎</span>{worst.reason}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed-overlay">
            <div className="glass-panel zoom-in" style={{ width: '90%', maxWidth: '500px', maxHeight: '90vh', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', zIndex: 50, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} />
                </button>

                <div style={{ background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)', padding: '30px 20px', color: 'white' }}>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Trophy size={28} /> Meal Ranking
                    </h2>
                    <p style={{ margin: '10px 0 0 0', opacity: 0.9, fontSize: '0.9rem' }}>
                        エレナが選ぶ、最近のベスト＆ワースト
                    </p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#F7F9FC' }}>
                    {loading && (
                        <div style={{ padding: '60px 0', textAlign: 'center' }}>
                            <div className="sparkle-spin" style={{ margin: '0 auto 20px' }}>
                                <Sparkles size={40} color="#667EEA" />
                            </div>
                            <p style={{ color: '#718096' }}>食事履歴からランキングを作成中...</p>
                        </div>
                    )}

                    {!loading && error && (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#E53E3E' }}>
                            <p>ランキングの作成に失敗しました。</p>
                            <p style={{ fontSize: '0.8rem', marginTop: '10px' }}>{errorMessage}</p>
                        </div>
                    )}

                    {!loading && ranking && (
                        <>
                            {RenderRankingCard('breakfast', ranking.breakfast)}
                            {RenderRankingCard('lunch', ranking.lunch)}
                            {RenderRankingCard('dinner', ranking.dinner)}

                            <div style={{ textAlign: 'center', marginTop: '30px', color: '#718096', fontSize: '0.8rem' }}>
                                <Sparkles size={12} style={{ marginRight: '4px' }} />
                                Analyzed by {ranking.model}
                            </div>
                        </>
                    )}
                </div>
            </div>
            <style jsx>{`
        .sparkle-spin { animation: spin 2s linear infinite; width: 40px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
