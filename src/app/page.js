"use client";
import React, { useState, useEffect } from 'react';
import DietPlanWizard from '@/components/DietPlanWizard';
import FoodLogger from '@/components/FoodLogger';
import { addMeal, getAllMeals, deleteAllMeals, deleteMealById } from '@/utils/db';
import { Camera, Utensils, Trash2, XCircle, Loader2, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

// ... imports
import { useAuth } from '@/lib/contexts/AuthContext';

// Firestore Imports
import { addMealToFirestore, getMealsFromFirestore, deleteMealFromFirestore } from '@/lib/firebase/firestore';

// Component
export default function Home() {
  const { user, googleSignIn, logOut, loading: authLoading } = useAuth();
  const [showLogger, setShowLogger] = useState(false);
  const [meals, setMeals] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date()); // State for selected date

  // Data Loading
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        const firestoreMeals = await getMealsFromFirestore(user.uid);
        setMeals(firestoreMeals);
      } catch (e) {
        console.error(e);
      }
    };
    if (user) loadData();
  }, [user]);

  // Date Helpers
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

  // Filter meals for display
  const displayMeals = meals.filter(meal => isSameDay(new Date(meal.timestamp), currentDate));

  const handleLogMeal = async (mealOrMeals) => {
    const mealsToLog = Array.isArray(mealOrMeals) ? mealOrMeals : [mealOrMeals];

    // Adjust timestamp to selected date
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
    } else {
      // ... local fallback logic if needed
    }
    setShowLogger(false);
  };

  // ... handleDeleteMeal, handleClearData

  // ...

  // Calculate totals (based on displayMeals)
  const totalCalories = displayMeals.reduce((acc, meal) => acc + meal.calories, 0);
  const targetCalories = user ? (user.targetCalories || 2200) : 2200;

  const remaining = Math.max(0, targetCalories - totalCalories);
  const progress = Math.min(100, (totalCalories / targetCalories) * 100);

  return (
    <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', paddingBottom: '120px' }}>
      <header style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 className="title-gradient" style={{ margin: 0, fontSize: '1.5rem' }}>LifeLog</h1>
          <button onClick={() => logOut && logOut()} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Log Out</button>
        </div>

        {/* Date Navigator */}
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 15px', marginBottom: '10px' }}>
          <button onClick={handlePrevDay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '5px' }}>
            <ChevronLeft />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', fontSize: '1.1rem' }}>
            <CalendarIcon size={20} color="var(--primary)" />
            <span onClick={() => document.getElementById('datePicker').showPicker()} style={{ cursor: 'pointer' }}>
              {dateString}
            </span>
            <input
              id="datePicker"
              type="date"
              onChange={(e) => setCurrentDate(new Date(e.target.value))}
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} // Hidden but functional
            />
          </div>

          <button onClick={handleNextDay} disabled={isToday(currentDate)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isToday(currentDate) ? 'var(--text-muted)' : 'var(--text-primary)', padding: '5px' }}>
            <ChevronRight />
          </button>
        </div>
      </header>

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '30px' }}>
        <div className="glass-panel" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
          <h3 style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>摂取カロリー</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{totalCalories} <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>kcal</span></p>
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '4px', background: 'var(--border-subtle)' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.5s ease' }} />
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>残り</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{remaining} <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>kcal</span></p>
        </div>
      </div>

      {/* Meal List */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ color: 'var(--text-secondary)', margin: 0 }}>今日の食事</h3>
        </div>

        {displayMeals.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', border: '1px dashed var(--border-subtle)', borderRadius: '16px' }}>
            {isToday(currentDate) ? '今日の食事はまだありません。' : `${dateString} の記録はありません。`}
            <br />下のボタンから追加してください。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {displayMeals.map((meal) => ( // Using implicit return
              <div key={meal.id || meal.timestamp} className="glass-panel fade-in" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                <img src={meal.image} alt={meal.foodName} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, fontSize: '1rem' }}>{meal.foodName}</h4>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {new Date(meal.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} • P: {meal.macros.protein}g
                  </p>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)', marginRight: '10px' }}>
                  {meal.calories}
                </div>
                <button
                  onClick={(e) => handleDeleteMeal(meal.id, e)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '5px' }}
                  aria-label="削除"
                >
                  <XCircle size={20} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Action */}
      <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
        <button
          className="btn-primary"
          onClick={() => setShowLogger(true)}
          style={{ padding: '16px 32px', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', boxShadow: '0 10px 30px rgba(74, 255, 176, 0.3)', whiteSpace: 'nowrap' }}
        >
          <Camera size={24} /> 食事を記録
        </button>
      </div>

      {showLogger && (
        <React.Suspense fallback={null}>
          <div style={{ position: 'relative', zIndex: 999 }}>
            <FoodLogger onLogMeal={handleLogMeal} onCancel={() => setShowLogger(false)} activeDate={currentDate} />
          </div>
        </React.Suspense>
      )}

      <style jsx global>{`
        .fade-in {
          animation: fadeIn 0.5s ease forwards;
          opacity: 0;
        }
        @keyframes fadeIn {
          to { opacity: 1; }
        }
      `}</style>
    </main>
  );
}
