"use client";
import React, { useState, useEffect } from 'react';
import FoodLogger from '@/components/FoodLogger';
import WeightTracker from '@/components/WeightTracker';
import EvaluationModal from '@/components/EvaluationModal';
import AdvisorModal from '@/components/AdvisorModal'; // Imported
import { Camera, XCircle, ChevronLeft, ChevronRight, Calculator, Weight, Utensils, Flame, Activity, Sparkles } from 'lucide-react';

import { useAuth } from '@/lib/contexts/AuthContext';
import { addMealToFirestore, getMealsFromFirestore, deleteMealFromFirestore, getWeightsFromFirestore, getUserProfile } from '@/lib/firebase/firestore';

export default function Home() {
  const { user, logOut } = useAuth();
  const [showLogger, setShowLogger] = useState(false);
  const [meals, setMeals] = useState([]);
  const [weights, setWeights] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modal States
  const [showWeightTracker, setShowWeightTracker] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [showAdvisor, setShowAdvisor] = useState(false); // New: Advisor State
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [initialRecipeSearch, setInitialRecipeSearch] = useState(null);

  // Data Loading
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        const [firestoreMeals, firestoreWeights, profile] = await Promise.all([
          getMealsFromFirestore(user.uid),
          getWeightsFromFirestore(user.uid),
          getUserProfile(user.uid)
        ]);
        setMeals(firestoreMeals);
        setWeights(firestoreWeights);
        setUserProfile(profile || { targetCalories: 2200 });
      } catch (e) {
        console.error(e);
      }
    };
    if (user) loadData();
  }, [user]);

  const refreshWeights = async () => {
    if (user) {
      const w = await getWeightsFromFirestore(user.uid);
      setWeights(w);
      const p = await getUserProfile(user.uid);
      setUserProfile(p);
    }
  };

  // Date Logic
  const isSameDay = (d1, d2) => {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
  };
  const isToday = (date) => isSameDay(date, new Date());

  const handlePrevDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 1);
    setCurrentDate(newDate);
  };
  const handleNextDay = () => {
    if (isToday(currentDate)) return;
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][currentDate.getDay()];
  const dateString = `${currentDate.getMonth() + 1}/${currentDate.getDate()} (${dayOfWeek})`;
  const currentDateKey = currentDate.toISOString().split('T')[0];

  // Derived Values
  const displayMeals = meals.filter(meal => isSameDay(new Date(meal.timestamp), currentDate));
  const selectedWeightEntry = weights.find(w => w.date === currentDateKey);

  const totalCalories = displayMeals.reduce((acc, meal) => acc + meal.calories, 0);
  const targetCalories = userProfile?.targetCalories || 2200;
  const remaining = Math.max(0, targetCalories - totalCalories);

  // Evaluation Data Prep
  const evaluationData = {
    date: dateString,
    consumedCalories: totalCalories,
    targetCalories: targetCalories,
    meals: displayMeals.map(m => ({
      foodName: m.foodName,
      calories: m.calories,
      macros: m.macros,
      timestamp: m.timestamp, // string
      // Exclude 'createdAt' or convert it if needed. AI doesn't need it.
    })),
    currentWeight: selectedWeightEntry?.weight,
    targetWeight: userProfile?.targetWeight,
    targetDate: userProfile?.targetDate
  };

  // Handlers
  const handleLogMeal = async (mealOrMeals) => {
    const mealsToLog = Array.isArray(mealOrMeals) ? mealOrMeals : [mealOrMeals];
    const adjustedMeals = mealsToLog.map(m => {
      const d = new Date(currentDate);
      const now = new Date();
      d.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      return { ...m, timestamp: d.toISOString() };
    });

    if (user) {
      await Promise.all(adjustedMeals.map(m => addMealToFirestore(user.uid, m)));
      const savedMeals = await getMealsFromFirestore(user.uid);
      setMeals(savedMeals);
    }
    setShowLogger(false);
  };

  const handleDeleteMeal = (id, e) => {
    e.stopPropagation();
    setDeleteConfirmation({ id });
  };

  const executeDeleteMeal = async () => {
    if (!deleteConfirmation || !user) return;
    try {
      await deleteMealFromFirestore(user.uid, deleteConfirmation.id);
      const savedMeals = await getMealsFromFirestore(user.uid);
      setMeals(savedMeals);
    } catch (e) {
      console.error(e);
      alert('削除に失敗しました');
    } finally {
      setDeleteConfirmation(null);
    }
  };

  const StatCard = ({ title, value, unit, icon, color, onClick, subtext }) => (
    <div onClick={onClick} className="glass-panel hover-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px', cursor: onClick ? 'pointer' : 'default', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{title}</span>
        {icon && React.cloneElement(icon, { size: 18, color: color || 'var(--text-muted)' })}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</span>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{unit}</span>
      </div>
      {subtext && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{subtext}</div>}
    </div>
  );

  return (
    <main style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', paddingBottom: '120px', fontFamily: '"Inter", sans-serif' }}>

      {/* Header */}
      <header style={{ marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.5px' }}>LifeLog</h1>
          </div>
          <button onClick={() => logOut && logOut()} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sign Out</button>
        </div>

        {/* Date Navigation */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px' }}>
          <button onClick={handlePrevDay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '5px' }}><ChevronLeft /></button>
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{currentDate.getFullYear()}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, cursor: 'pointer' }} onClick={() => document.getElementById('datePicker').showPicker()}>
              {dateString}
            </div>
            <input id="datePicker" type="date" onChange={(e) => setCurrentDate(new Date(e.target.value))} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' }} />
          </div>
          <button onClick={handleNextDay} disabled={isToday(currentDate)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isToday(currentDate) ? 'var(--text-muted)' : 'var(--text-secondary)', padding: '5px' }}><ChevronRight /></button>
        </div>
      </header>

      {/* Dashboard Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
        <StatCard
          title="Calorie Intake"
          value={totalCalories}
          unit="kcal"
          icon={<Flame />}
          color="#FF6B6B"
          onClick={() => setShowEvaluation(true)} // Toggle Evaluation
          subtext={`タップしてAI評価を見る`}
        />

        {/* New AI Advisor Card (Small one or integrate? Let's add a small button below stats or a new card row) */}
        {/* Let's just create a Floating or Header button for Advisor? Or maybe replace Weight card with something else? 
           User wants "Proposal", maybe a dedicated button is good.
           Let's put it as a banner or extra button.
        */}

        <StatCard
          title="Weight"
          value={selectedWeightEntry ? selectedWeightEntry.weight : '--'}
          unit="kg"
          icon={<Weight />}
          color="#4ECDC4"
          onClick={() => setShowWeightTracker(true)}
          subtext={selectedWeightEntry ? '記録済み' : 'タップして管理'}
        />
      </div>

      {/* AI Advisor Banner */}
      <div
        onClick={() => setShowAdvisor(true)}
        className="glass-panel"
        style={{ padding: '15px 20px', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', background: 'linear-gradient(135deg, #fff 0%, #f3f4f6 100%)', border: '1px solid #c7d2fe' }}
      >
        <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '50%', color: '#4338ca' }}>
          <Sparkles size={24} />
        </div>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#3730a3' }}>AI食事提案</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>今のあなたに最適な次の一食を提案します</div>
        </div>
      </div>

      {/* PFC Balance Card */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '25px' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="var(--primary)" /> PFC Balance
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {[
            { label: 'Protein', key: 'protein', color: '#48BB78', targetRatio: 0.2, kcalPerG: 4 }, // 20%
            { label: 'Fat', key: 'fat', color: '#ECC94B', targetRatio: 0.3, kcalPerG: 9 },     // 30%
            { label: 'Carbs', key: 'carbs', color: '#4299E1', targetRatio: 0.5, kcalPerG: 4 }   // 50%
          ].map((macro) => {
            const totalG = displayMeals.reduce((acc, m) => acc + (m.macros?.[macro.key] || 0), 0);
            // Calculate Approx Target based on Calorie Goal
            const targetG = Math.round((targetCalories * macro.targetRatio) / macro.kcalPerG);
            const percent = Math.min(100, (totalG / targetG) * 100);

            return (
              <div key={macro.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '5px' }}>
                  <span>{macro.label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{totalG.toFixed(1)}</span> / {targetG}g
                  </span>
                </div>
                <div style={{ height: '8px', background: '#EDF2F7', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${percent}%`, height: '100%', background: macro.color, borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- Modals --- */}

      {showWeightTracker && (
        <div style={{ position: 'relative', zIndex: 1000 }}>
          <WeightTracker
            user={user}
            userProfile={userProfile}
            weights={weights}
            activeDate={currentDate} // Pass current date for logging
            onClose={() => {
              setShowWeightTracker(false);
              refreshWeights();
            }}
            onUpdateWeights={refreshWeights}
          />
        </div>
      )}

      {showEvaluation && (
        <div style={{ position: 'relative', zIndex: 1001 }}>
          <EvaluationModal
            data={evaluationData}
            onClose={() => setShowEvaluation(false)}
          />
        </div>
      )}

      {showAdvisor && (
        <div style={{ position: 'relative', zIndex: 1002 }}>
          <AdvisorModal
            history={meals.slice(0, 30)} // Pass recent history
            dailyLog={{
              totalCalories,
              macros: {
                protein: displayMeals.reduce((acc, m) => acc + (m.macros?.protein || 0), 0),
                fat: displayMeals.reduce((acc, m) => acc + (m.macros?.fat || 0), 0),
                carbs: displayMeals.reduce((acc, m) => acc + (m.macros?.carbs || 0), 0)
              },
              targetCalories
            }}
            onClose={() => setShowAdvisor(false)}
            onSuggestionClick={(query) => {
              setShowAdvisor(false);
              setInitialRecipeSearch(query);
              setShowLogger(true);
            }}
          />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {
        deleteConfirmation && (
          <div className="fixed-overlay" style={{ zIndex: 2000 }}>
            <div className="glass-panel" style={{ padding: '20px', width: '300px', textAlign: 'center' }}>
              <p style={{ marginBottom: '20px', fontWeight: 'bold' }}>記録を削除しますか？</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setDeleteConfirmation(null)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>キャンセル</button>
                <button onClick={executeDeleteMeal} className="btn-primary" style={{ flex: 1, background: '#ff4d4d', borderColor: '#ff4d4d' }}>削除</button>
              </div>
            </div>
          </div>
        )
      }

      {/* Meal Timeline */}
      <div style={{ marginBottom: '40px' }}>
        <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Utensils size={18} /> 食事の記録
        </h3>

        {displayMeals.length === 0 ? (
          <div className="empty-state">
            <p>記録がありません</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {displayMeals.map((meal) => (
              <div key={meal.id || meal.timestamp} className="glass-panel" style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '45px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                      {new Date(meal.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div style={{ width: '40px', height: '40px', background: 'var(--bg-main)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                    <Utensils size={18} />
                  </div>

                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{meal.foodName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>P: {meal.macros.protein}g</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                    {meal.calories} <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)' }}>kcal</span>
                  </div>
                  <button onClick={(e) => handleDeleteMeal(meal.id, e)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.5 }}>
                    <XCircle size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
        <button
          className="btn-primary"
          onClick={() => setShowLogger(true)}
          style={{ padding: '14px 28px', borderRadius: '50px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 8px 24px rgba(74, 255, 176, 0.4)' }}
        >
          <Camera size={20} /> 記録する
        </button>
      </div>

      {
        showLogger && (
          <React.Suspense fallback={null}>
            <div style={{ position: 'relative', zIndex: 999 }}>
              <FoodLogger
                onLogMeal={handleLogMeal}
                onCancel={() => {
                  setShowLogger(false);
                  setInitialRecipeSearch(null);
                }}
                activeDate={currentDate}
                initialRecipeSearch={initialRecipeSearch}
              />
            </div>
          </React.Suspense>
        )
      }

      <style jsx global>{`
        body { background-color: #F7F9FC; color: #2D3748; }
        .title-gradient { background: linear-gradient(135deg, #2D3748 0%, #4A5568 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .glass-panel { background: white; border: 1px solid rgba(0,0,0,0.04); border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02); transition: transform 0.2s, box-shadow 0.2s; }
        .hover-card:active { transform: scale(0.98); }
        .btn-primary { background: #2D3748; color: white; border: none; cursor: pointer; transition: transform 0.1s; border-radius: 12px; }
        .btn-primary:active { transform: scale(0.95); }
        .fixed-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; }
        .zoom-in { animation: zoomIn 0.2s ease forwards; }
        @keyframes zoomIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .empty-state { text-align: center; color: #A0AEC0; padding: 40px; border: 2px dashed #E2E8F0; border-radius: 20px; }
      `}</style>
    </main >
  );
}
