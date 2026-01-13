"use client";
import {
  evaluateDailyLog,
  evaluateSingleMeal, // New import
  calculateRecipeWithGemini,
  updateUserTargetWeight
} from './actions';
import React, { useState, useEffect } from 'react';
import FoodLogger from '@/components/FoodLogger';
import WeightTracker from '@/components/WeightTracker';
import EvaluationModal from '@/components/EvaluationModal';
import AdvisorModal from '@/components/AdvisorModal';
import StockManager from '@/components/StockManager'; // Imported
import DietShooter from '@/components/DietShooter';
import { Camera, XCircle, ChevronLeft, ChevronRight, Calculator, Weight, Utensils, Flame, Activity, Sparkles, Loader2, LogIn, Refrigerator, Gamepad2 } from 'lucide-react';

import { useAuth } from '@/lib/contexts/AuthContext';
import { addMealToFirestore, getMealsFromFirestore, deleteMealFromFirestore, getWeightsFromFirestore, getUserProfile, updateMealInFirestore, addStockItem, getStockItems, deleteStockItem } from '@/lib/firebase/firestore';

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
  const [targetMealType, setTargetMealType] = useState('dinner'); // For Advisor
  const [showStockManager, setShowStockManager] = useState(false); // Stock Manager
  const [showGame, setShowGame] = useState(false); // Mini Game
  const [stockItems, setStockItems] = useState([]); // Stock Items

  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false); // New: Delete Loading State
  const [initialRecipeSearch, setInitialRecipeSearch] = useState(null);

  // AI Persistence State
  const [dailyEvaluation, setDailyEvaluation] = useState(null); // Persist Evaluation
  const [advisorState, setAdvisorState] = useState({ suggestions: [], advice: null, targetType: 'dinner' }); // Persist Advisor
  const [recipeSearchState, setRecipeSearchState] = useState({ query: '', results: [] }); // Persist Recipe Search

  // Data Loading
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        const [firestoreMeals, firestoreWeights, profile, firestoreStock] = await Promise.all([
          getMealsFromFirestore(user.uid),
          getWeightsFromFirestore(user.uid),
          getUserProfile(user.uid),
          getStockItems(user.uid)
        ]);
        setMeals(firestoreMeals);
        setWeights(firestoreWeights);
        setStockItems(firestoreStock || []);
        setUserProfile(profile || { targetCalories: 2200 });

        // Auto-evaluate meals without scores (batch process)
        const unevaluatedMeals = firestoreMeals.filter(m => typeof m.score !== 'number');
        if (unevaluatedMeals.length > 0) {
          console.log(`[AutoEval] Found ${unevaluatedMeals.length} unevaluated meals, processing...`);
          // Process all unevaluated meals
          for (const meal of unevaluatedMeals) {
            try {
              console.log(`[AutoEval] Evaluating: ${meal.foodName}`);
              const result = await evaluateSingleMeal(meal);
              if (typeof result.score === 'number') {
                // Update Firestore
                await updateMealInFirestore(user.uid, meal.id, { score: result.score, reason: result.reason });
                // Update local state
                setMeals(prev => prev.map(m => m.id === meal.id ? { ...m, score: result.score, reason: result.reason } : m));
                console.log(`[AutoEval] Evaluated ${meal.foodName}: Score ${result.score}`);
              }
            } catch (err) {
              console.error(`[AutoEval] Failed to evaluate ${meal.foodName}:`, err);
            }
          }
        }
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

  // Calculate Totals for Today
  const getDailyTotals = (date) => {
    const dailyMeals = meals.filter(m => isSameDay(new Date(m.timestamp), date));
    return dailyMeals.reduce((acc, meal) => ({
      calories: acc.calories + (meal.calories || 0),
      protein: acc.protein + (meal.macros?.protein || 0),
      fat: acc.fat + (meal.macros?.fat || 0),
      carbs: acc.carbs + (meal.macros?.carbs || 0),
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
  };

  const dayTotals = getDailyTotals(currentDate);

  // --- Dynamic Calorie Target Logic ---
  // Calculate "debt" or "savings" from previous 3 days to adjust today's target
  const getDynamicTarget = () => {
    if (!userProfile?.targetCalories) return 2200;

    let baseTarget = userProfile.targetCalories;
    let balance = 0;

    // Look back 3 days
    for (let i = 1; i <= 3; i++) {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - i);

      const totals = getDailyTotals(d);
      // If no data for that day, skip (assume neutral)
      const hasData = meals.some(m => isSameDay(new Date(m.timestamp), d));
      if (hasData) {
        balance += (totals.calories - baseTarget);
      }
    }

    // Adjustment: Subtract 1/3 of the accumulated surplus/deficit from today's target
    // If we ate too much (+balance), target goes down.
    // If we ate too little (-balance), target goes up (optional, currently enabled).
    const adjustment = Math.round(balance / 3);
    const dynamicTarget = baseTarget - adjustment;

    // Safety limits: Don't drop below 1200 or go above base + 500
    if (dynamicTarget < 1200) return 1200;
    if (dynamicTarget > baseTarget + 500) return baseTarget + 500;

    return Math.round(dynamicTarget);
  };

  const dailyTarget = getDynamicTarget();
  const baseTarget = userProfile?.targetCalories || 2200;
  const isAdjusted = dailyTarget !== baseTarget;

  // Prepare History for AI Context
  const getHistorySummary = () => {
    // Get last 7 days summary
    let summary = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const totals = getDailyTotals(d);
      const hasData = meals.some(m => isSameDay(new Date(m.timestamp), d));
      if (hasData) {
        summary.push(`${d.toLocaleDateString()}: ${totals.calories}kcal (Target-${Math.round(totals.calories - baseTarget)})`);
      }
    }
    return summary.join('\n');
  };

  // Derived Values
  const displayMeals = meals.filter(meal => isSameDay(new Date(meal.timestamp), currentDate));
  const selectedWeightEntry = weights.find(w => w.date === currentDateKey);

  const totalCalories = displayMeals.reduce((acc, meal) => acc + meal.calories, 0);
  const targetCalories = userProfile?.targetCalories || 2200;
  const remaining = Math.max(0, targetCalories - totalCalories);

  // Evaluation Data Prep
  const evaluationData = {
    date: currentDate.toISOString(),
    consumedCalories: dayTotals.calories,
    targetCalories: dailyTarget, // Use Dynamic Target
    baseTargetCalories: baseTarget, // Pass base for reference
    historySummary: getHistorySummary(), // Pass history context
    meals: meals.filter(m => isSameDay(new Date(m.timestamp), currentDate)).map(m => ({
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
      // 1. Add to Firestore & Capture IDs
      const addedIds = await Promise.all(adjustedMeals.map(m => addMealToFirestore(user.uid, m)));

      // 2. Fetch latest state (or locally append if we want instant UI, but fetch is safer for sync)
      // We do this concurrently with background eval to be faster
      // getMealsFromFirestore(user.uid).then(setMeals); // <-- Removing this race condition source

      const newMeals = adjustedMeals.map((m, i) => ({ ...m, id: addedIds[i] }));

      // Update local state smoothly (Prepend new meals as they are newest, then sort to be sure)
      setMeals(prev => {
        const combined = [...newMeals, ...prev];
        return combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      });

      // 3. Background Evaluation (Fire and Forget)
      // Iterate using the captured IDs
      adjustedMeals.forEach(async (m, index) => {
        // Eval
        console.log('[MealColorDebug] Evaluating meal:', m.foodName);
        const evalResult = await evaluateSingleMeal(m);
        console.log('[MealColorDebug] Eval result:', evalResult);
        if (evalResult && typeof evalResult.score === 'number') {
          const targetId = addedIds[index]; // Guaranteed match by index order
          console.log('[MealColorDebug] Updating Firestore for ID:', targetId, 'Score:', evalResult.score);
          if (targetId) {
            // Update Firestore
            const updates = {
              score: evalResult.score,
              assessment: evalResult.score >= 8 ? 'positive' : (evalResult.score <= 3 ? 'negative' : 'neutral') // Legacy compat
            };
            await updateMealInFirestore(user.uid, targetId, updates);
            console.log('[MealColorDebug] Firestore updated, now updating local state');

            // Update Local State (Optimistic but accurate ID)
            setMeals(prev => prev.map(p => p.id === targetId ? { ...p, ...updates } : p));
          }
        } else {
          console.warn('[MealColorDebug] No valid score in evalResult:', evalResult);
        }
      });
    }
    setShowLogger(false);
  };

  const handleDeleteMeal = (id, e) => {
    e.stopPropagation();
    setDeleteConfirmation({ id });
  };

  const executeDeleteMeal = async () => {
    if (!deleteConfirmation || !user) return;
    setIsDeleting(true);
    try {
      await deleteMealFromFirestore(user.uid, deleteConfirmation.id);
      // Optimistic update or fetch
      const savedMeals = await getMealsFromFirestore(user.uid);
      setMeals(savedMeals);
    } catch (e) {
      console.error(e);
      alert('削除に失敗しました');
    } finally {
      setIsDeleting(false);
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
        // Create a copy to avoid mutating state directly
        const updatedMeal = { ...meal };
        let changed = false;

        // Update score if available
        if (typeof matchingAssessment.score === 'number') {
          updatedMeal.score = matchingAssessment.score;
          updateMealInFirestore(user.uid, meal.id, { score: updatedMeal.score });
          changed = true;
        }
        // Legacy: match assessment if provided
        if (matchingAssessment.assessment) {
          updatedMeal.assessment = matchingAssessment.assessment;
          updateMealInFirestore(user.uid, meal.id, { assessment: updatedMeal.assessment });
          changed = true;
        }
        return changed ? updatedMeal : meal;
      }
      return meal;
    });
    setMeals([...updatedMeals]); // Force re-render with new array reference
  };

  const handleAddStock = async (item) => {
    if (!user) return;
    await addStockItem(user.uid, item);
    const items = await getStockItems(user.uid);
    setStockItems(items);
  };

  const handleDeleteStock = async (id) => {
    if (!user) return;
    await deleteStockItem(user.uid, id);
    const items = await getStockItems(user.uid);
    setStockItems(items);
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

        <button onClick={googleSignIn} className="glass-panel hover-card" style={{ paddingTop: '15px', paddingBottom: '15px', paddingLeft: '30px', paddingRight: '30px', display: 'flex', alignItems: 'center', gap: '15px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', border: '1px solid var(--border-subtle)', background: 'white' }}>
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
    <main style={{ paddingTop: '20px', paddingRight: '20px', paddingLeft: '20px', paddingBottom: '120px', maxWidth: '600px', margin: '0 auto', fontFamily: '"Inter", sans-serif' }}>

      {/* Header */}
      <header style={{ marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.5px' }}>LifeLog</h1>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setShowStockManager(true)} style={{ background: 'white', border: '1px solid var(--border-subtle)', padding: '6px 10px', borderRadius: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Refrigerator size={14} /> 食材
            </button>
            <button onClick={() => setShowGame(true)} style={{ background: 'white', border: '1px solid var(--border-subtle)', padding: '6px 10px', borderRadius: '20px', fontSize: '0.8rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Gamepad2 size={14} /> Game
            </button>
            <button onClick={() => {
              // Intelligent default based on time
              const hour = new Date().getHours();
              let type = 'dinner';
              if (hour < 11) type = 'breakfast';
              else if (hour < 16) type = 'lunch';
              setTargetMealType(type);
              setShowAdvisor(true);
            }} style={{ background: 'white', border: '1px solid var(--border-subtle)', padding: '6px 10px', borderRadius: '20px', fontSize: '0.8rem', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Sparkles size={14} /> 提案
            </button>
            <button onClick={() => logOut && logOut()} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sign Out</button>
          </div>
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
            // Always open evaluation, regardless of meal completion
            setShowEvaluation(true);
          }}
          subtext="タップして現在の状況をAI評価"
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
            savedResult={dailyEvaluation} // Pass persisted result
            onSave={setDailyEvaluation}   // Save result callback
            onClose={() => setShowEvaluation(false)}
            onEvaluationComplete={handleEvaluationComplete}
          />
        </div>
      )}

      {showAdvisor && (
        <div style={{ position: 'relative', zIndex: 1000 }}>
          <AdvisorModal
            targetType={targetMealType} // NEW prop
            history={meals} // Use full meal history (filtered in modal)
            dailyLog={{
              totalCalories,
              macros: {
                protein: displayMeals.reduce((acc, m) => acc + (m.macros?.protein || 0), 0),
                fat: displayMeals.reduce((acc, m) => acc + (m.macros?.fat || 0), 0),
                carbs: displayMeals.reduce((acc, m) => acc + (m.macros?.carbs || 0), 0),
                targetCalories
              }
            }}
            savedState={advisorState} // Pass persisted state
            onSave={setAdvisorState}   // Save state callback
            onClose={() => setShowAdvisor(false)}
            onSuggestionClick={(query) => {
              setShowAdvisor(false);
              setInitialRecipeSearch(query);
              setShowLogger(true);
            }}
            stockItems={stockItems}
          />
        </div>
      )}

      {showStockManager && (
        <div style={{ position: 'relative', zIndex: 1002 }}>
          <StockManager
            isOpen={showStockManager}
            onClose={() => setShowStockManager(false)}
            stockItems={stockItems}
            onAdd={handleAddStock}
            onDelete={handleDeleteStock}
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
                <button onClick={() => setDeleteConfirmation(null)} disabled={isDeleting} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: isDeleting ? 'not-allowed' : 'pointer' }}>キャンセル</button>
                <button onClick={executeDeleteMeal} disabled={isDeleting} className="btn-primary" style={{ flex: 1, background: '#ff4d4d', borderColor: '#ff4d4d', cursor: isDeleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  {isDeleting ? <Loader2 className="spin" size={16} /> : '削除'}
                </button>
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
              // Helper to get color and style from score (0: Red, 5: Neutral, 10: Green)
              const getMealScoreStyle = (meal) => {
                let score = null; // null means not evaluated yet

                if (typeof meal.score === 'number') {
                  score = meal.score;
                } else if (meal.assessment) {
                  // Backward compatibility
                  if (meal.assessment === 'positive') score = 8;
                  if (meal.assessment === 'negative') score = 2;
                  if (meal.assessment === 'neutral') score = 5;
                }

                // Not evaluated yet
                if (score === null) {
                  return { background: 'white', borderLeft: 'none', scoreDisplay: null };
                }

                // Clamp score
                score = Math.max(0, Math.min(10, score));

                // Color calculation - more visible now!
                let bgColor, borderColor, scoreColor;

                if (score >= 7) {
                  // Good (7-10): Green shades
                  const intensity = (score - 5) / 5; // 0.4 to 1
                  bgColor = `rgba(72, 187, 120, ${0.1 + intensity * 0.2})`; // 0.1 to 0.3
                  borderColor = `rgba(72, 187, 120, ${0.5 + intensity * 0.5})`;
                  scoreColor = '#22543D';
                } else if (score <= 3) {
                  // Bad (0-3): Red shades
                  const intensity = (5 - score) / 5; // 0.4 to 1
                  bgColor = `rgba(245, 101, 101, ${0.1 + intensity * 0.2})`;
                  borderColor = `rgba(245, 101, 101, ${0.5 + intensity * 0.5})`;
                  scoreColor = '#742A2A';
                } else {
                  // Neutral (4-6): Light gray/yellow
                  bgColor = 'rgba(237, 242, 247, 0.8)';
                  borderColor = 'rgba(160, 174, 192, 0.5)';
                  scoreColor = '#4A5568';
                }

                return {
                  background: bgColor,
                  borderLeft: `4px solid ${borderColor}`,
                  scoreDisplay: score,
                  scoreColor
                };
              };

              const scoreStyle = getMealScoreStyle(meal);

              return (
                <div key={meal.id || meal.timestamp} className="glass-panel" style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', background: scoreStyle.background, borderLeft: scoreStyle.borderLeft, transition: 'all 0.3s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '45px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        {new Date(meal.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {/* Meal Type Badge (Click to Rotate) */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const types = ['breakfast', 'lunch', 'dinner', 'snack'];
                          const currentIdx = types.indexOf(meal.mealType || 'snack');
                          const nextType = types[(currentIdx + 1) % types.length];

                          // 1. Optimistic Update (Immediate UI Feedback)
                          setMeals(prev => prev.map(m => m.id === meal.id ? { ...m, mealType: nextType } : m));

                          // 2. Background Update
                          try {
                            await updateMealInFirestore(user.uid, meal.id, { mealType: nextType });
                          } catch (err) {
                            console.error("Failed to update meal type", err);
                            // Revert if failed (optional, but good practice)
                            setMeals(prev => prev.map(m => m.id === meal.id ? { ...m, mealType: meal.mealType } : m));
                          }
                        }}
                        style={{ marginTop: '5px', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'white', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {{ breakfast: '🌅 朝食', lunch: '☀️ 昼食', dinner: '🌙 夕食', snack: '🍪 間食' }[meal.mealType] || '🍪 間食'}
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, marginLeft: '10px' }}>
                      <div style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', maxWidth: '36px', maxHeight: '36px', background: scoreStyle.scoreDisplay !== null ? scoreStyle.background : 'var(--bg-main)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: scoreStyle.scoreDisplay !== null ? scoreStyle.scoreColor : 'var(--primary)', fontWeight: 700, fontSize: '1rem', border: scoreStyle.scoreDisplay !== null ? `2px solid ${scoreStyle.scoreColor}` : 'none', flexShrink: 0 }}>
                        {scoreStyle.scoreDisplay !== null ? scoreStyle.scoreDisplay : <Utensils size={16} />}
                      </div>

                      <div>
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{meal.foodName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                          <span>P: {meal.macros?.protein || 0}g</span>
                          <span>F: {meal.macros?.fat || 0}g</span>
                          <span>C: {meal.macros?.carbs || 0}g</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        {meal.calories} <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)' }}>kcal</span>
                      </div>
                      <button onClick={(e) => handleDeleteMeal(meal.id, e)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.5 }}>
                        <XCircle size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
        }
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
                stockItems={stockItems}
                savedRecipeSearch={recipeSearchState} // Pass persisted search
                onSaveRecipeSearch={setRecipeSearchState} // Save search callback
              />
            </div>
          </React.Suspense>
        )
      }

      <style jsx global>{`
        body { background-color: #F7F9FC; color: #2D3748; }
        .title-gradient { background: linear-gradient(135deg, #2D3748 0%, #4A5568 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .glass-panel { background: white; border: 1px solid rgba(0,0,0,0.04); border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02); }
        .hover-card:active { transform: scale(0.98); }
        .btn-primary { background: #2D3748; color: white; border: none; cursor: pointer; transition: transform 0.1s; border-radius: 12px; }
        .btn-primary:active { transform: scale(0.95); }
        .fixed-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; }
        .zoom-in { animation: zoomIn 0.2s ease forwards; }
        @keyframes zoomIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .glass-panel.no-hover:hover { transform: none !important; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02) !important; }
        .empty-state { text-align: center; color: #A0AEC0; padding: 40px; border: 2px dashed #E2E8F0; border-radius: 20px; }
      `}</style>

      {/* Diet Shooter Game Overlay */}
      {showGame && (
        <DietShooter meals={meals} user={user} userProfile={userProfile} onClose={() => setShowGame(false)} />
      )}

    </main >
  );
}
