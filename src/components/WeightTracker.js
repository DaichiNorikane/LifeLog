"use client";
import React, { useState, useMemo } from 'react';
import { X, Save, TrendingDown, Calendar, Target, AlertCircle, Ruler, Loader2, Sparkles } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { saveUserProfile, addWeightToFirestore } from '@/lib/firebase/firestore';
import { analyzeGoalFeasibility } from '@/app/actions';


// BMI計算関数
const calculateBMI = (weight, heightCm) => {
    if (!weight || !heightCm) return null;
    const heightM = heightCm / 100;
    return (weight / (heightM * heightM)).toFixed(1);
};

// BMIから体重を逆算
const getWeightFromBMI = (bmi, heightCm) => {
    if (!bmi || !heightCm) return null;
    const heightM = heightCm / 100;
    return (bmi * heightM * heightM).toFixed(1);
};

// BMI判定
const getBMICategory = (bmi) => {
    if (!bmi) return { label: '-', color: '#718096' };
    const b = parseFloat(bmi);
    if (b < 18.5) return { label: '低体重', color: '#4299E1' };
    if (b < 25) return { label: '普通体重', color: '#48BB78' };
    if (b < 30) return { label: '肥満(1度)', color: '#ECC94B' };
    if (b < 35) return { label: '肥満(2度)', color: '#ED8936' };
    return { label: '肥満(3度以上)', color: '#F56565' };
};

export default function WeightTracker({ user, userProfile, weights, activeDate, onClose, onUpdateWeights, ...props }) {
    // Current Goals from User Profile
    const [targetWeight, setTargetWeight] = useState(userProfile?.targetWeight || '');
    const [targetDate, setTargetDate] = useState(userProfile?.targetDate || '');
    const [height, setHeight] = useState(userProfile?.height || '');
    const [targetBMI, setTargetBMI] = useState(userProfile?.targetBMI || '22');
    const [isSaving, setIsSaving] = useState(false);

    // Daily Log State
    const [dailyWeight, setDailyWeight] = useState('');

    // Analysis State
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(userProfile?.lastDiagnosis || null);
    const [recommendedCalories, setRecommendedCalories] = useState(userProfile?.lastDiagnosis?.recommended_daily_calories || '');

    const handleAnalyzeGoal = async () => {
        if (!currentWeight || !targetWeight || !targetDate) {
            alert("現在の体重、目標体重、目標日を設定してください。");
            return;
        }

        setIsAnalyzing(true);
        setAnalysisResult(null);

        try {
            // Calculate recent calories from props (if passed) or default to logic in actions if null
            // We need to calculate it here if possible, but props.weights doesn't have meal data.
            // Let's passed in meal data from parent? No, WeightTracker takes `weights`.
            // We'll pass `recentCalories` from parent `page.js`.
            // User requested to fix missing calorie data. `WeightTracker` needs `recentCalories` prop.

            const result = await analyzeGoalFeasibility({
                currentWeight: parseFloat(currentWeight),
                targetWeight: parseFloat(targetWeight),
                targetDate,
                height: parseFloat(height),
                recentCalories: props.recentCalories || null, // Expecting prop
                streakDays: props.streakDays || 0 // Expecting prop
            });

            if (result.error) {
                alert("分析に失敗しました: " + result.error);
            } else {
                setAnalysisResult(result);
                if (result.recommended_daily_calories) {
                    setRecommendedCalories(result.recommended_daily_calories);
                }
                // Save diagnosis to Firestore
                try {
                    await saveUserProfile(user.uid, { lastDiagnosis: result });
                } catch (saveErr) {
                    console.error("Failed to save diagnosis:", saveErr);
                }
            }
        } catch (e) {
            console.error(e);
            alert("エラーが発生しました");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSaveAnalysisResult = async () => {
        if (!user || (!recommendedCalories && !targetWeight)) return;
        setIsSaving(true);
        try {
            const updates = {};
            if (targetWeight) updates.targetWeight = targetWeight;
            if (targetDate) updates.targetDate = targetDate;
            if (height) updates.height = height;
            if (recommendedCalories) updates.targetCalories = parseInt(recommendedCalories);

            await saveUserProfile(user.uid, updates);

            // Close analysis and notify
            setAnalysisResult(null);
            alert("目標と摂取カロリー目安を保存しました！\nホーム画面のAI判定もこれに基づいて更新されます。");

            if (onUpdateWeights) onUpdateWeights(); // Refresh parent data (profile)
            if (onClose) onClose();
            // Ideally trigger refresh, page.js will refresh on profile change? 
            // userProfile state in page.js needs update. onUpdateWeights reloads? 
            // We might need onUpdateProfile callback. For now rely on next load or reload.
        } catch (e) {
            console.error(e);
            alert("保存に失敗しました");
        } finally {
            setIsSaving(false);
        }
    };


    const [targetDateForEntry, setTargetDateForEntry] = useState(activeDate ? new Date(activeDate) : new Date());

    // Set initial daily weight if exists for targetDateForEntry
    useMemo(() => {
        if (!targetDateForEntry) return;

        const d = new Date(targetDateForEntry);
        const offset = d.getTimezoneOffset() * 60000;
        const localDate = new Date(d.getTime() - offset);
        const dateKey = localDate.toISOString().split('T')[0];

        const initial = weights.find(w => w.date === dateKey)?.weight;
        // If a weight exists, set it. If not, clear it (so we don't carry over weight from other days)
        setDailyWeight(initial || '');
    }, [targetDateForEntry, weights]);

    // ... (rest of code)

    const handleLogWeight = async () => {
        if (!dailyWeight || !user || !targetDateForEntry) return;
        try {
            await addWeightToFirestore(user.uid, dailyWeight, targetDateForEntry);
            onUpdateWeights(); // Refresh weights
            alert(`${targetDateForEntry.getMonth() + 1}/${targetDateForEntry.getDate()}の体重を記録しました`);
        } catch (e) {
            console.error(e);
            alert('記録に失敗しました');
        }
    }

    return (
        <div className="fixed-overlay">
            {/* ... (Header and other sections) ... */}

            {/* Daily Input */}
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="date"
                            value={targetDateForEntry.toISOString().split('T')[0]} // Simple format, verify timezone
                            onChange={(e) => setTargetDateForEntry(new Date(e.target.value))}
                            style={{
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '6px',
                                padding: '4px',
                                fontSize: '0.9rem',
                                background: '#f8fafc',
                                color: 'var(--text-primary)'
                            }}
                        />
                        の体重
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
            {/* ... */}


            {/* Chart */}

            {/* Chart */}
            <div style={{ height: '300px', width: '100%', background: '#fff', borderRadius: '16px', padding: '10px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis
                            dataKey="x"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(unixTime) => {
                                const d = new Date(unixTime);
                                return `${d.getMonth() + 1}/${d.getDate()}`;
                            }}
                            tick={{ fontSize: 12, fill: '#aaa' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#aaa' }} axisLine={false} tickLine={false} unit="kg" />
                        <Tooltip
                            labelFormatter={(unixTime) => new Date(unixTime).toLocaleDateString()}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            formatter={(value, name, props) => [
                                `${value} kg`,
                                props.payload.isTarget ? '目標' : '体重'
                            ]}
                        />
                        <Line
                            type="monotone"
                            dataKey="weight"
                            stroke="var(--primary)"
                            strokeWidth={3}
                            dot={(props) => {
                                const { cx, cy, payload } = props;
                                if (payload.isTarget) {
                                    return <Target key={payload.x} x={cx - 10} y={cy - 10} size={20} color="red" />;
                                }
                                return <circle key={payload.x} cx={cx} cy={cy} r={4} fill="var(--primary)" stroke="none" />;
                            }}
                            activeDot={{ r: 6 }}
                        />
                        {targetWeight && (
                            <ReferenceLine y={parseFloat(targetWeight)} stroke="#F56565" strokeDasharray="3 3" label={{ value: `目標:${targetWeight}kg`, position: 'right', fill: '#F56565', fontSize: 10 }} />
                        )}
                        {targetBMIWeight && height && (
                            <ReferenceLine y={parseFloat(targetBMIWeight)} stroke="#48BB78" strokeDasharray="5 5" label={{ value: `BMI${targetBMI}:${targetBMIWeight}kg`, position: 'right', fill: '#48BB78', fontSize: 10 }} />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Goal Settings Form */}
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Target size={18} /> 目標設定
                </h3>

                {/* 身長入力 */}
                <div style={{ marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <Ruler size={16} color="var(--primary)" />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>身長</span>
                    </div>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <input
                                type="number"
                                value={height}
                                onChange={(e) => setHeight(e.target.value)}
                                placeholder="170"
                                style={{ ...inputStyle, textAlign: 'center' }}
                            />
                        </div>
                        <span style={{ color: 'var(--text-muted)' }}>cm</span>
                        {height && currentBMI && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                現在BMI: <strong style={{ color: bmiCategory.color }}>{currentBMI}</strong>
                            </div>
                        )}
                    </div>
                </div>

                {/* 目標体重・期限 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-end', marginBottom: '15px' }}>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>目標体重 (kg)</label>
                        <input
                            type="number"
                            value={targetWeight}
                            onChange={(e) => setTargetWeight(e.target.value)}
                            placeholder="60.0"
                            style={inputStyle}
                        />
                        {height && targetWeight && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                → BMI {calculateBMI(targetWeight, height)}
                            </div>
                        )}
                    </div>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>達成予定日</label>
                        <input
                            type="date"
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                            style={inputStyle}
                        />
                    </div>
                </div>

                {/* 目標BMI */}
                {height && (
                    <div style={{ marginBottom: '15px', padding: '12px', background: '#F0FFF4', borderRadius: '10px', border: '1px solid #C6F6D5' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.85rem', color: '#2F855A' }}>目標BMI:</span>
                            <select
                                value={targetBMI}
                                onChange={(e) => setTargetBMI(e.target.value)}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #C6F6D5', background: 'white', fontSize: '0.9rem' }}
                            >
                                <option value="20">20 (美容体重)</option>
                                <option value="21">21</option>
                                <option value="22">22 (標準)</option>
                                <option value="23">23</option>
                                <option value="24">24</option>
                            </select>
                            <span style={{ fontSize: '0.85rem', color: '#2F855A' }}>
                                → {targetBMIWeight}kg
                            </span>
                        </div>
                    </div>
                )}

                <button className="btn-primary" onClick={handleSaveGoal} disabled={isSaving} style={{ padding: '10px 20px', height: '42px', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}>
                    <Save size={18} /> {isSaving ? '保存中...' : '保存'}
                </button>
            </div>

        </div>
            </div >

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
        </div >
    );
}

const inputStyle = {
    width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
    fontSize: '1rem', outline: 'none', background: '#f8fafc'
};
