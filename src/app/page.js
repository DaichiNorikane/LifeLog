"use client";
import React, { useState, useEffect } from 'react';
import FoodLogger from '@/components/FoodLogger';
import WeightTracker from '@/components/WeightTracker';
import EvaluationModal from '@/components/EvaluationModal';
import AdvisorModal from '@/components/AdvisorModal'; // Imported
import { Camera, XCircle, ChevronLeft, ChevronRight, Calculator, Weight, Utensils, Flame, Activity, Sparkles, Loader2, LogIn } from 'lucide-react';

import { useAuth } from '@/lib/contexts/AuthContext';
import { addMealToFirestore, getMealsFromFirestore, deleteMealFromFirestore, getWeightsFromFirestore, getUserProfile, updateMealInFirestore } from '@/lib/firebase/firestore';

export default function Home() {
  const { user, logOut, googleSignIn, loading } = useAuth();
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

  // Lock body scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = showLogger || showWeightTracker || showEvaluation || showAdvisor || deleteConfirmation;
    if (isAnyModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open'); // Cleanup
  }, [showLogger, showWeightTracker, showEvaluation, showAdvisor, deleteConfirmation]);

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

  const handleEvaluationComplete = async (result) => {
    if (!user || !result.foodAssessments) return;

    // Update meals with assessments using partial name matching
    const updatedMeals = meals.map(meal => {
      // Find matching assessment (partial match for flexibility)
      const matchingAssessment = result.foodAssessments.find(item =>
        meal.foodName.includes(item.foodName) || item.foodName.includes(meal.foodName)
      );

      if (matchingAssessment) {
        meal.assessment = matchingAssessment.assessment;
        // Fire and forget update to Firestore
        updateMealInFirestore(user.uid, meal.id, { assessment: meal.assessment });
      }
      return meal;
    });
    setMeals([...updatedMeals]); // Force re-render with new array reference
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


  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#F7F9FC' }}>
        <Loader2 className="spin" size={40} color="var(--primary)" />
        <style jsx global>{`
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return (
      <main style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: '"Inter", sans-serif', textAlign: 'center' }}>
        <div style={{ marginBottom: '40px' }}>
          <div style={{ width: '80px', height: '80px', background: 'var(--primary)', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={40} color="white" />
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '10px' }}>LifeLog</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>AIで食事管理をもっと簡単に。理想の自分へ近づこう。</p>
        </div>

        <button onClick={googleSignIn} className="glass-panel hover-card" style={{ padding: '15px 30px', display: 'flex', alignItems: 'center', gap: '15px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', border: '1px solid var(--border-subtle)', background: 'white' }}>
          <div style={{ width: '24px', height: '24px' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          </div>
          Googleでログイン
        </button>

        <style jsx global>{`
            body { background-color: #F7F9FC; color: #2D3748; margin: 0; }
            .glass-panel { background: white; border: 1px solid rgba(0,0,0,0.04); border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
            .hover-card:active { transform: scale(0.98); transition: transform 0.1s; }
        `}</style>
      </main>
    )
  }

  // --- Authenticated Layout ---
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
          onClick={() => {
            const now = new Date();
            const hour = now.getHours();
            const mealCount = displayMeals.length;

            // Evening (after 19:00) or 3+ meals logged -> Review mode
            if (hour >= 19 || mealCount >= 3) {
              setShowEvaluation(true);
            } else {
              // Morning/Afternoon -> Suggestion mode (if meals remain)
              setShowAdvisor(true);
            }
          }}
          subtext={(() => {
            const hour = new Date().getHours();
            if (hour >= 19 || displayMeals.length >= 3) return 'タップして1日を振り返る';
            return 'タップして次の食事を提案';
          })()}
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
            onEvaluationComplete={handleEvaluationComplete}
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
            {displayMeals.map((meal) => {
              // Background Color Coding Logic
              let bgColor = 'white';
              if (meal.assessment === 'positive') {
                bgColor = 'rgba(72, 187, 120, 0.15)'; // Light Green
              } else if (meal.assessment === 'negative') {
                bgColor = 'rgba(245, 101, 101, 0.15)'; // Light Red
              }

              return (
                <div key={meal.id || meal.timestamp} className="glass-panel" style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', background: bgColor }}>
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
              );
            })}
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
