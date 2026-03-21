"use client";
import React, { useState, useEffect, useRef } from 'react';
import { X, Trophy, AlertCircle, CheckCircle, Brain, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getQuizFromStock, saveQuizToStock, updateQuizResult, getQuizStockCount } from '@/lib/firebase/firestore';
import { generateQuizWithGemini } from '@/app/actions';

const ElenaChallengeModal = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [quiz, setQuiz] = useState(null);
    const [result, setResult] = useState(null); // 'correct' | 'incorrect' | null
    const [streak, setStreak] = useState(0);
    const [selectedOption, setSelectedOption] = useState(null);
    const [isStocking, setIsStocking] = useState(false);

    // Prevent double-fetching on mount
    const hasFetched = useRef(false);

    useEffect(() => {
        if (isOpen && user) {
            loadQuiz();
            checkAndRefillStock();
        } else {
            // Reset state when closed
            setQuiz(null);
            setResult(null);
            setLoading(true);
            setSelectedOption(null);
            hasFetched.current = false;
        }
    }, [isOpen, user]);

    const loadQuiz = async () => {
        setLoading(true);
        setResult(null);
        setSelectedOption(null);
        try {
            const q = await getQuizFromStock(user.uid);
            if (q) {
                setQuiz(q);
            } else {
                // Determine if we need to generate immediately (stock empty)
                console.log("Stock empty, generating immediately...");
                await refillStock(true); // Force wait
                const newQ = await getQuizFromStock(user.uid);
                setQuiz(newQ);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const checkAndRefillStock = async () => {
        if (isStocking) return;
        const count = await getQuizStockCount(user.uid);
        console.log(`Current quiz stock: ${count}`);
        if (count < 50) { // Keep stock around 50
            refillStock();
        }
    };

    const refillStock = async (wait = false) => {
        setIsStocking(true);
        try {
            // Generate 3-5 quizzes
            console.log("Generating quizzes...");
            const newQuizzes = await generateQuizWithGemini(5);
            if (Array.isArray(newQuizzes)) {
                const promises = newQuizzes.map(q => saveQuizToStock(user.uid, q));
                if (wait) await Promise.all(promises);
                else Promise.all(promises); // Background
                console.log(`Added ${newQuizzes.length} quizzes to stock`);
            }
        } catch (e) {
            console.error("Failed to refill stock", e);
        } finally {
            setIsStocking(false);
        }
    };

    const handleOptionClick = async (index) => {
        if (result !== null) return; // Prevent double click
        setSelectedOption(index);

        const isCorrect = index === quiz.correctIndex;
        setResult(isCorrect ? 'correct' : 'incorrect');

        if (isCorrect) {
            setStreak(prev => prev + 1);
        } else {
            setStreak(0);
        }

        // Update Backend
        await updateQuizResult(user.uid, quiz.id, isCorrect);
    };

    const handleNext = () => {
        loadQuiz();
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)',
            zIndex: 1001, display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4
        }}>
            <div className="glass-panel" style={{
                width: '90%', maxWidth: '400px',
                background: 'white', borderRadius: '24px',
                padding: '24px', position: 'relative',
                boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                maxHeight: '90vh', overflowY: 'auto'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Brain className="text-purple-500" size={24} />
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2D3748' }}>
                            Elena's Challenge
                        </h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={24} color="#A0AEC0" />
                    </button>
                </div>

                {/* Streak Badge */}
                <div style={{
                    background: '#F7FAFC', padding: '8px 16px', borderRadius: '12px',
                    marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
                }}>
                    <Trophy size={16} color={streak > 0 ? "#ECC94B" : "#CBD5E0"} />
                    <span style={{ fontWeight: 700, color: '#4A5568', fontSize: '0.9rem' }}>
                        連続正解: <span style={{ color: '#E53E3E', fontSize: '1.1rem' }}>{streak}</span>
                    </span>
                </div>

                {/* Content */}
                {loading || !quiz ? (
                    <div style={{ padding: '40px 0', textAlign: 'center', color: '#A0AEC0' }}>
                        <Loader2 className="spin" style={{ margin: '0 auto 10px' }} />
                        <p>問題を準備しています...</p>
                        {isStocking && <p style={{ fontSize: '0.8rem', marginTop: '5px' }}>AIが新しい問題を生成中...</p>}
                    </div>
                ) : (
                    <>
                        {/* Elena's Message Area */}
                        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                            <div style={{
                                width: '60px', height: '60px', borderRadius: '50%', background: '#E9D8FD',
                                overflow: 'hidden', flexShrink: 0,
                                border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                <img
                                    src={result === 'correct' ? "/images/elena/elena_score_100.webp" : (result === 'incorrect' ? "/images/elena/elena_score_0_20.webp" : "/images/elena.webp")}
                                    alt="Elena"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                            <div style={{
                                background: '#F7FAFC', padding: '12px 16px', borderRadius: '4px 16px 16px 16px',
                                fontSize: '0.95rem', lineHeight: '1.5', color: '#2D3748', flex: 1
                            }}>
                                {result === null ? quiz.question :
                                    result === 'correct' ? "素晴らしいです！正解ですよ✨" :
                                        "あらら...残念。解説を読んで復習しましょう！🔥"}
                            </div>
                        </div>

                        {/* Options */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {quiz.options.map((opt, idx) => {
                                let bgColor = 'white';
                                let borderColor = '#E2E8F0';
                                let textColor = '#4A5568';

                                if (result !== null) {
                                    if (idx === quiz.correctIndex) {
                                        bgColor = '#F0FFF4';
                                        borderColor = '#48BB78';
                                        textColor = '#2F855A';
                                    } else if (idx === selectedOption && idx !== quiz.correctIndex) {
                                        bgColor = '#FFF5F5';
                                        borderColor = '#F56565';
                                        textColor = '#C53030';
                                    } else {
                                        borderColor = 'transparent';
                                        textColor = '#CBD5E0'; // Dim others
                                    }
                                }

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleOptionClick(idx)}
                                        disabled={result !== null}
                                        style={{
                                            padding: '16px', borderRadius: '12px',
                                            border: `2px solid ${borderColor}`,
                                            background: bgColor,
                                            color: textColor,
                                            fontWeight: 600,
                                            textAlign: 'left',
                                            cursor: result === null ? 'pointer' : 'default',
                                            transition: 'all 0.2s',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}
                                        className={result === null ? 'hover:bg-gray-50' : ''}
                                    >
                                        <span>{opt}</span>
                                        {result !== null && idx === quiz.correctIndex && <CheckCircle size={18} />}
                                        {result !== null && idx === selectedOption && idx !== quiz.correctIndex && <X size={18} />}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Explanation & Next */}
                        {result !== null && (
                            <div style={{ marginTop: '20px', animation: 'fadeIn 0.3s ease' }}>
                                <div style={{
                                    background: '#EBF8FF', padding: '15px', borderRadius: '12px',
                                    marginBottom: '20px', borderLeft: '4px solid #4299E1'
                                }}>
                                    <div style={{ fontWeight: 700, color: '#2B6CB0', marginBottom: '4px', fontSize: '0.85rem' }}>
                                        Elenas's Point
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#2C5282' }}>
                                        {quiz.explanation}
                                    </div>
                                </div>

                                <button
                                    onClick={handleNext}
                                    style={{
                                        width: '100%', padding: '14px',
                                        background: 'var(--primary)', color: 'white',
                                        borderRadius: '12px', fontWeight: 700, border: 'none',
                                        cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                                        boxShadow: '0 4px 6px rgba(66, 153, 225, 0.3)'
                                    }}
                                >
                                    次の問題へ <RefreshCw size={18} />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
            <style jsx global>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .glass-panel { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); }
            `}</style>
        </div>
    );
};

export default ElenaChallengeModal;
