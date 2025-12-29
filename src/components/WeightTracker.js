"use client";
import React, { useState, useMemo } from 'react';
import { X, Save, TrendingDown, Calendar, Target, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { saveUserProfile, addWeightToFirestore } from '@/lib/firebase/firestore';

export default function WeightTracker({ user, userProfile, weights, activeDate, onClose, onUpdateWeights }) {
    // Current Goals from User Profile
    const [targetWeight, setTargetWeight] = useState(userProfile?.targetWeight || '');
    const [targetDate, setTargetDate] = useState(userProfile?.targetDate || '');
    const [isSaving, setIsSaving] = useState(false);

    // Daily Log State
    const [dailyWeight, setDailyWeight] = useState('');

    // Set initial daily weight if exists for activeDate
    useMemo(() => {
        if (!activeDate) return;
        const dateKey = activeDate.toISOString().split('T')[0];
        const initial = weights.find(w => w.date === dateKey)?.weight;
        if (initial) setDailyWeight(initial);
    }, [activeDate, weights]);

    // Prepare Graph Data
    const chartData = useMemo(() => {
        // Sort weights by date ascending
        const sorted = [...weights].sort((a, b) => new Date(a.date) - new Date(b.date));

        // If we have a target date/weight, we might want to project it? 
        // For now, let's just show history + a reference line
        return sorted.map(w => ({
            date: w.date.substring(5), // MM-DD
            fullDate: w.date,
            weight: w.weight
        }));
    }, [weights]);

    // Calculate Insights
    const currentWeight = weights.length > 0 ? weights[0].weight : null; // weights is desc in prop, wait. 
    // In firestore.js `getWeights` sorts by date desc. So weights[0] is latest.
    // Confirmed in firestore.js: orderBy("date", "desc")

    const remainingKg = (currentWeight && targetWeight) ? (currentWeight - targetWeight).toFixed(1) : null;

    // Days Remaining
    const daysRemaining = targetDate ? Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;

    // Required Pace (kg / week)
    const requiredPace = (remainingKg && daysRemaining && daysRemaining > 0)
        ? (remainingKg / (daysRemaining / 7)).toFixed(2)
        : null;

    const handleSaveGoal = async () => {
        if (!user) return;
        setIsSaving(true);
        try {
            await saveUserProfile(user.uid, {
                targetWeight: parseFloat(targetWeight),
                targetDate: targetDate
            });
            onUpdateWeights(); // Refresh goals
            alert('目標を保存しました');
        } catch (e) {
            console.error(e);
            alert('保存に失敗しました');
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogWeight = async () => {
        if (!dailyWeight || !user || !activeDate) return;
        try {
            await addWeightToFirestore(user.uid, dailyWeight, activeDate);
            onUpdateWeights(); // Refresh weights
            alert('体重を記録しました');
        } catch (e) {
            console.error(e);
            alert('記録に失敗しました');
        }
    }

    return (
        <div className="fixed-overlay">
            <div className="glass-panel zoom-in" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '0', position: 'relative', display: 'flex', flexDirection: 'column' }}>

                {/* Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <TrendingDown color="var(--primary)" /> 体重管理 & 目標
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '30px' }}>

                    {/* Insights Cards */}
                    {targetWeight && currentWeight && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                            <div className="insight-card">
                                <div className="label">現在</div>
                                <div className="value">{currentWeight} <span className="unit">kg</span></div>
                            </div>
                            <div className="insight-card">
                                <div className="label">目標まで</div>
                                <div className="value" style={{ color: 'var(--primary)' }}>{remainingKg > 0 ? `-${remainingKg}` : '+0'} <span className="unit">kg</span></div>
                            </div>
                            <div className="insight-card">
                                <div className="label">期限まで</div>
                                <div className="value">{daysRemaining > 0 ? daysRemaining : 0} <span className="unit">日</span></div>
                            </div>
                            <div className="insight-card" style={{ background: requiredPace > 1 ? '#FFF5F5' : '#F0FFF4' }}>
                                <div className="label">必要ペース</div>
                                <div className="value" style={{ color: requiredPace > 1 ? '#C53030' : '#2F855A' }}>
                                    {requiredPace > 0 ? requiredPace : '-'} <span className="unit">kg/週</span>
                                </div>
                                {requiredPace > 1 && <div style={{ fontSize: '0.7rem', color: '#C53030', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={10} /> ペースがきつめです</div>}
                            </div>
                        </div>
                    )}

                    {/* Daily Input */}
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                                {activeDate ? `${activeDate.getMonth() + 1}/${activeDate.getDate()}` : '今日'}の体重
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>記録・更新</div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={dailyWeight}
                                    onChange={(e) => setDailyWeight(e.target.value)}
                                    placeholder="0.0"
                                    style={{ ...inputStyle, width: '100px', textAlign: 'center', paddingRight: '25px' }}
                                />
                                <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>kg</span>
                            </div>
                            <button className="btn-primary" onClick={handleLogWeight} style={{ padding: '0 15px' }}>記録</button>
                        </div>
                    </div>

                    {/* Chart */}

                    {/* Chart */}
                    <div style={{ height: '300px', width: '100%', background: '#fff', borderRadius: '16px', padding: '10px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#aaa' }} axisLine={false} tickLine={false} />
                                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#aaa' }} axisLine={false} tickLine={false} unit="kg" />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    formatter={(value) => [`${value} kg`, '体重']}
                                />
                                <Line type="monotone" dataKey="weight" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: 'var(--primary)', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                {targetWeight && (
                                    <ReferenceLine y={targetWeight} label="目標" stroke="red" strokeDasharray="3 3" />
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Goal Settings Form */}
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
                        <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Target size={18} /> 目標設定
                        </h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end' }}>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>目標体重 (kg)</label>
                                <input
                                    type="number"
                                    value={targetWeight}
                                    onChange={(e) => setTargetWeight(e.target.value)}
                                    placeholder="60.0"
                                    style={inputStyle}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>達成予定日</label>
                                <input
                                    type="date"
                                    value={targetDate}
                                    onChange={(e) => setTargetDate(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>
                            <button className="btn-primary" onClick={handleSaveGoal} disabled={isSaving} style={{ padding: '10px 20px', height: '42px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Save size={18} /> {isSaving ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            <style jsx>{`
                .insight-card {
                    background: white;
                    padding: 15px;
                    border-radius: 12px;
                    border: 1px solid var(--border-subtle);
                    text-align: center;
                }
                .label { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px; }
                .value { font-size: 1.4rem; font-weight: bold; color: var(--text-primary); }
                .unit { font-size: 0.8rem; font-weight: normal; color: var(--text-muted); }
            `}</style>
        </div>
    );
}

const inputStyle = {
    width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
    fontSize: '1rem', outline: 'none', background: '#f8fafc'
};
