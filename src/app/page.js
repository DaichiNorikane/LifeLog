"use client";
import React, { useState, useEffect } from 'react';
import DietPlanWizard from '@/components/DietPlanWizard';
import FoodLogger from '@/components/FoodLogger';
import { addMeal, getAllMeals, deleteAllMeals, deleteMealById } from '@/utils/db';
import { Camera, Utensils, Trash2, XCircle, Loader2 } from 'lucide-react';

// ... imports
import { useAuth } from '@/lib/contexts/AuthContext';

// Firestore Imports
import { addMealToFirestore, getMealsFromFirestore, deleteMealFromFirestore } from '@/lib/firebase/firestore';

// Component
export default function Home() {
  const { user, googleSignIn, logOut, loading: authLoading } = useAuth(); // Added logOut
  const [showLogger, setShowLogger] = useState(false);
  const [meals, setMeals] = useState([]);

  // Data Loading
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      try {
        // 1. Load from Firestore
        const firestoreMeals = await getMealsFromFirestore(user.uid);

        // 2. If Firestore is empty, check LocalDB and migration could happen here.
        // For now, let's just prioritize Firestore if available, otherwise fallback or sync?
        // Simplest approach: Use Firestore as source of truth.

        // If Firestore returns data, use it.
        // If user just logged in and has local data but no cloud data, maybe we should upload?
        // Let's keep it simple: Just load from Firestore.

        setMeals(firestoreMeals);
      } catch (e) {
        console.error(e);
      }
    };
    if (user) loadData();
  }, [user]);

  const handleLogMeal = async (mealOrMeals) => {
    const mealsToLog = Array.isArray(mealOrMeals) ? mealOrMeals : [mealOrMeals];

    if (user) {
      // Parallelize writes for speed
      await Promise.all(mealsToLog.map(m => addMealToFirestore(user.uid, m)));

      const savedMeals = await getMealsFromFirestore(user.uid);
      setMeals(savedMeals);
    } else {
      for (const m of mealsToLog) {
        await addMeal(m);
      }
      const savedMeals = await getAllMeals();
      savedMeals.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setMeals(savedMeals);
    }
    setShowLogger(false);
  };

  const handleDeleteMeal = async (id, e) => {
    e.stopPropagation();
    if (confirm('この食事記録を削除しますか？')) {
      if (user) {
        await deleteMealFromFirestore(user.uid, id);
        const savedMeals = await getMealsFromFirestore(user.uid);
        setMeals(savedMeals);
      }
    }
  };

  // ... handleClearData (maybe disable for cloud or clear cloud?)
  const handleClearData = async () => {
    if (confirm('全てのデータをリセットしますか？')) {
      // For Safety, maybe just alert not implemented or clear local only?
      // Let's assume clear local only for now to prevent massive cloud deletion accidents
      await deleteAllMeals();
      // setMeals([]); // Don't clear state if we are viewing cloud data
      alert("ローカルキャッシュをクリアしました");
    }
  }

  // ...

  if (authLoading) return <div className="flex-center" style={{ height: '100vh' }}><Loader2 className="spin" /></div>;

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '20px' }}>
        <div className="glass-panel" style={{ padding: '40px', maxWidth: '400px', textAlign: 'center' }}>
          <img src="/icon.png" alt="LifeLog" style={{ width: '80px', marginBottom: '20px', borderRadius: '16px' }} />
          <h1 className="title-gradient" style={{ marginBottom: '10px' }}>LifeLog</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
            AIで記録する、<br />新しい食事管理スタイル。
          </p>
          <button
            onClick={googleSignIn}
            className="btn-primary"
            style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
          >
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  // ... rest of the app (onboarding logic needed if user profile is missing in Firestore, but for now let's stick to auth)


  // Calculate totals
  const totalCalories = meals.reduce((acc, meal) => acc + meal.calories, 0);
  const targetCalories = user.targetCalories || 2200; // Default if not yet set in profile

  const remaining = Math.max(0, targetCalories - totalCalories);
  const progress = Math.min(100, (totalCalories / targetCalories) * 100);

  return (
    <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', paddingBottom: '120px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 className="title-gradient" style={{ margin: 0 }}>LifeLog</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Welcome back, Champion</p>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div className="glass-panel" style={{ padding: '8px 16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>目標: {targetCalories}</span>
          </div>
          <button onClick={handleClearData} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px' }} title="キャッシュクリア">
            <Trash2 size={18} />
          </button>
          <button onClick={() => logOut && logOut()} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px' }} title="ログアウト">
            <span style={{ fontSize: '0.8rem' }}>Log Out</span>
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

        {meals.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', border: '1px dashed var(--border-subtle)', borderRadius: '16px' }}>
            食事が記録されていません。<br />下のボタンから写真を追加してください。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {meals.map((meal) => ( // Using implicit return
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
            <FoodLogger onLogMeal={handleLogMeal} onCancel={() => setShowLogger(false)} />
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
