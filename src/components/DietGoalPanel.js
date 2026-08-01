"use client";
import React, { useState, useMemo } from 'react';
import { Save, TrendingDown, Target, AlertCircle, Ruler, Loader2, Sparkles } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { saveUserProfile } from '@/lib/firebase/firestore';
import { analyzeGoalFeasibility } from '@/app/actions/daily-evaluation';


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

const normalizeNullableNumber = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

/**
 * ダイエット目標のパネル（いつまでに何kg痩せるか）。
 *
 * 体重の実測値は eufy 体組成計 → ヘルスケア → API で自動的に入るため、
 * 手入力と日々の記録一覧は持たない。ここが引き受けるのは「目標」だけ。
 * 実測の表示は ActivityCard、この2つを BodyDetailModal が並べて見せる。
 */
export default function DietGoalPanel({ user, userProfile, weights, onClose, onUpdateWeights, ...props }) {
    // Current Goals from User Profile
    const [targetWeight, setTargetWeight] = useState(userProfile?.targetWeight || '');
    const [targetDate, setTargetDate] = useState(userProfile?.targetDate || '');
    const [height, setHeight] = useState(userProfile?.height || '');
    const [targetBMI, setTargetBMI] = useState(userProfile?.targetBMI || '22');
    const [isSaving, setIsSaving] = useState(false);

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


    // Prepare Graph Data
    const chartData = useMemo(() => {
        // Sort weights by date ascending
        const sorted = [...weights].sort((a, b) => new Date(a.date) - new Date(b.date));

        const data = sorted.map(w => ({
            x: new Date(w.date).getTime(),
            date: w.date.substring(5), // Keep for tooltip if needed, but main x is number
            weight: w.weight,
            bodyFat: normalizeNullableNumber(w.bodyFat),
            isTarget: false
        }));

        // Add Target Point if valid and in future
        if (targetDate && targetWeight && sorted.length > 0) {
            const lastDate = new Date(sorted[sorted.length - 1].date);
            const tDate = new Date(targetDate);
            if (tDate > lastDate) {
                data.push({
                    x: tDate.getTime(),
                    date: targetDate.substring(5),
                    weight: parseFloat(targetWeight),
                    bodyFat: null,
                    isTarget: true
                });
            }
        }
        return data;
    }, [weights, targetDate, targetWeight]);

    const hasBodyFatData = chartData.some(d => !d.isTarget && d.bodyFat !== null);

    // Calculate Insights
    const currentWeight = weights.length > 0 ? weights[0].weight : null;
    // In firestore.js `getWeights` sorts by date desc. So weights[0] is latest.

    const remainingKg = (currentWeight && targetWeight) ? (currentWeight - targetWeight).toFixed(1) : null;

    // Days Remaining
    const daysRemaining = targetDate ? Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;

    // Required Pace (kg / week)
    const requiredPace = (remainingKg && daysRemaining && daysRemaining > 0)
        ? (remainingKg / (daysRemaining / 7)).toFixed(2)
        : null;

    // BMI計算
    const currentBMI = calculateBMI(currentWeight, height);
    const targetWeightBMI = calculateBMI(targetWeight, height);
    const bmiCategory = getBMICategory(currentBMI);

    // 目標BMIから算出される体重
    const targetBMIWeight = getWeightFromBMI(targetBMI, height);

    const handleSaveGoal = async () => {
        if (!user) return;
        setIsSaving(true);
        try {
            const patch = {
                targetWeight: parseFloat(targetWeight),
                targetDate: targetDate,
                height: parseFloat(height),
                targetBMI: parseFloat(targetBMI),
            };

            // 進捗率は「開始体重からどれだけ減ったか」で出す。
            // startWeight は今まで誰も保存しておらず、常に現在体重にフォールバックしていたため
            // 進捗が 0% のまま動かなかった。目標を立てた時点の体重をここで記録する。
            if (userProfile?.startWeight == null && currentWeight) {
                patch.startWeight = currentWeight;
            }

            await saveUserProfile(user.uid, patch);
            onUpdateWeights(); // Refresh goals
            alert('目標を保存しました');
        } catch (e) {
            console.error(e);
            alert('保存に失敗しました');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div>
                <h2 style={{ margin: '0 0 16px', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingDown size={18} color="var(--primary)" /> ダイエット目標
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>

                    {/* --- Metrics Grid (Horizontal Layout) --- */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                        {/* Current */}
                        <div className="insight-card">
                            <div className="label">現在</div>
                            <div className="value">{currentWeight || '-'} <span className="unit">kg</span></div>
                        </div>

                        {/* BMI */}
                        {height && currentBMI && (
                            <div className="insight-card" style={{ background: bmiCategory ? bmiCategory.color + '15' : 'white' }}>
                                <div className="label">BMI</div>
                                <div className="value" style={{ color: bmiCategory ? bmiCategory.color : 'inherit' }}>{currentBMI}</div>
                                <div style={{ fontSize: '0.7rem', color: bmiCategory ? bmiCategory.color : 'inherit', marginTop: '2px' }}>{bmiCategory ? bmiCategory.label : ''}</div>
                            </div>
                        )}

                        {/* Until Goal */}
                        {targetWeight && (
                            <div className="insight-card">
                                <div className="label">目標まで</div>
                                <div className="value" style={{ color: 'var(--primary)' }}>{remainingKg && remainingKg > 0 ? `-${remainingKg}` : '+0'} <span className="unit">kg</span></div>
                            </div>
                        )}

                        {/* Until Deadline */}
                        {targetDate && (
                            <div className="insight-card">
                                <div className="label">期限まで</div>
                                <div className="value">{daysRemaining && daysRemaining > 0 ? daysRemaining : 0} <span className="unit">日</span></div>
                            </div>
                        )}

                        {/* Required Pace - Full Width */}
                        {requiredPace && (
                            <div className="insight-card" style={{ gridColumn: 'span 2', background: requiredPace > 1 ? '#FFF5F5' : '#F0FFF4' }}>
                                <div className="label">必要ペース</div>
                                <div className="value" style={{ color: requiredPace > 1 ? '#C53030' : '#2F855A' }}>
                                    {requiredPace > 0 ? requiredPace : '-'} <span className="unit">kg/週</span>
                                </div>
                                {requiredPace > 1 && <div style={{ fontSize: '0.7rem', color: '#C53030', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><AlertCircle size={10} /> きつめ</div>}
                            </div>
                        )}
                    </div>

                    {/* --- Elena's Proposal Section --- */}
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
                        <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sparkles size={18} color="#10B981" /> Elena's Proposal
                        </h3>

                        {!analysisResult ? (
                            <div style={{ textAlign: 'center', padding: '10px 0' }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                                    現在の目標設定（{targetWeight || '未設定'}kgまであと{remainingKg || '?'}kg）について、<br />
                                    現実的なペースかどうか診断します。
                                </p>
                                <button
                                    onClick={handleAnalyzeGoal}
                                    disabled={isAnalyzing || !targetWeight || !targetDate}
                                    style={{
                                        width: '100%',
                                        background: '#10B981',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        padding: '14px 24px',
                                        borderRadius: '50px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        fontSize: '1rem',
                                        opacity: (isAnalyzing || !targetWeight || !targetDate) ? 0.5 : 1,
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {isAnalyzing ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                                    {isAnalyzing ? '分析中...' : '診断を開始する'}
                                </button>
                            </div>
                        ) : (
                            <div>
                                {/* Result Badge */}
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
                                    <div style={{
                                        padding: '6px 16px',
                                        borderRadius: '50px',
                                        fontSize: '0.9rem',
                                        fontWeight: 'bold',
                                        background: analysisResult.feasibility === 'Impossible' ? '#FEF2F2' : analysisResult.feasibility === 'Strict' ? '#FFF7ED' : analysisResult.feasibility === 'Realistic' ? '#ECFDF5' : '#EFF6FF',
                                        color: analysisResult.feasibility === 'Impossible' ? '#DC2626' : analysisResult.feasibility === 'Strict' ? '#EA580C' : analysisResult.feasibility === 'Realistic' ? '#059669' : '#2563EB',
                                        border: `1px solid ${analysisResult.feasibility === 'Impossible' ? '#FECACA' : analysisResult.feasibility === 'Strict' ? '#FED7AA' : analysisResult.feasibility === 'Realistic' ? '#A7F3D0' : '#BFDBFE'}`
                                    }}>
                                        {analysisResult.feasibility === 'Impossible' ? '判定: 無理ゲー 😱' : analysisResult.feasibility === 'Strict' ? '判定: かなり厳しい 🔥' : analysisResult.feasibility === 'Realistic' ? '判定: 適正ライン ✅' : '判定: 余裕 ✨'}
                                    </div>
                                </div>

                                {/* Reasoning Text - renders line breaks and bold */}
                                <div
                                    style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.8', marginBottom: '15px', padding: '12px', background: '#f8fafc', borderRadius: '12px' }}
                                    dangerouslySetInnerHTML={{
                                        __html: analysisResult.reasoning
                                            .replace(/\n/g, '<br />')
                                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                                    }}
                                />

                                {/* Calorie Recommendation */}
                                {analysisResult.recommended_daily_calories && (
                                    <div style={{ marginBottom: '15px', padding: '12px', background: '#FFFBEB', borderRadius: '12px', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#92400E' }}>推奨摂取カロリー</label>
                                        <div style={{ display: 'flex', alignItems: 'center', background: 'white', borderRadius: '8px', padding: '4px 10px', border: '1px solid #FDE68A' }}>
                                            <input
                                                type="number"
                                                value={recommendedCalories}
                                                onChange={(e) => setRecommendedCalories(e.target.value)}
                                                style={{ width: '70px', textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem', color: '#78350F', background: 'transparent', border: 'none', outline: 'none' }}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: '#B45309', fontWeight: 'bold' }}>kcal/日</span>
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons - 3 buttons horizontal */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                    <button
                                        onClick={handleAnalyzeGoal}
                                        disabled={isAnalyzing || !targetWeight || !targetDate}
                                        style={{
                                            padding: '10px 8px',
                                            borderRadius: '50px',
                                            background: 'transparent',
                                            border: '1px solid #10B981',
                                            color: '#10B981',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            fontSize: '0.85rem',
                                            opacity: isAnalyzing ? 0.5 : 1
                                        }}
                                    >
                                        {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                        {isAnalyzing ? '分析中' : '再診断'}
                                    </button>
                                    <button
                                        onClick={handleSaveAnalysisResult}
                                        style={{
                                            padding: '10px 8px',
                                            borderRadius: '50px',
                                            background: '#10B981',
                                            border: 'none',
                                            color: 'white',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            fontSize: '0.85rem'
                                        }}
                                    >
                                        <Save size={14} /> 目標に設定
                                    </button>
                                    <button
                                        onClick={() => setAnalysisResult(null)}
                                        style={{
                                            padding: '10px 8px',
                                            borderRadius: '50px',
                                            background: 'transparent',
                                            border: '1px solid var(--border-subtle)',
                                            color: 'var(--text-secondary)',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem'
                                        }}
                                    >
                                        閉じる
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Chart — 体重・体脂肪率の推移。単日の実測は ActivityCard 側が担当する */}
                    <div style={{ height: '300px', width: '100%', background: '#fff', borderRadius: '16px', padding: '10px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 20, right: hasBodyFatData ? 42 : 30, left: 0, bottom: 0 }}>
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
                                <YAxis yAxisId="weight" domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#aaa' }} axisLine={false} tickLine={false} unit="kg" />
                                {hasBodyFatData && (
                                    <YAxis yAxisId="bodyFat" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#F59E0B' }} axisLine={false} tickLine={false} unit="%" />
                                )}
                                <Tooltip
                                    labelFormatter={(unixTime) => new Date(unixTime).toLocaleDateString()}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    formatter={(value, name, props) => [
                                        props.dataKey === 'bodyFat' ? `${value}%` : `${value} kg`,
                                        props.dataKey === 'bodyFat' ? '体脂肪率' : (props.payload.isTarget ? '目標' : '体重')
                                    ]}
                                />
                                <Line
                                    yAxisId="weight"
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
                                {hasBodyFatData && (
                                    <Line
                                        yAxisId="bodyFat"
                                        type="monotone"
                                        dataKey="bodyFat"
                                        name="体脂肪率"
                                        stroke="#F59E0B"
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: '#F59E0B', stroke: 'none' }}
                                        activeDot={{ r: 5 }}
                                        connectNulls
                                    />
                                )}
                                {targetWeight && (
                                    <ReferenceLine yAxisId="weight" y={parseFloat(targetWeight)} stroke="#F56565" strokeDasharray="3 3" label={{ value: `目標:${targetWeight}kg`, position: 'right', fill: '#F56565', fontSize: 10 }} />
                                )}
                                {targetBMIWeight && height && (
                                    <ReferenceLine yAxisId="weight" y={parseFloat(targetBMIWeight)} stroke="#48BB78" strokeDasharray="5 5" label={{ value: `BMI${targetBMI}:${targetBMIWeight}kg`, position: 'right', fill: '#48BB78', fontSize: 10 }} />
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
        </>
    );
}

const inputStyle = {
    width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
    fontSize: '1rem', outline: 'none', background: '#f8fafc'
};
