"use client";
import { evaluateDailyLog, evaluateSingleMeal } from './actions/daily-evaluation';
import { analyzeCondition } from './actions/condition-analysis';
import { calculateRecipeWithGemini } from './actions/recipe';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';

const FoodLogger = dynamic(() => import('@/components/FoodLogger'), { ssr: false });
const BodyDetailModal = dynamic(() => import('@/components/BodyDetailModal'), { ssr: false });
const EvaluationModal = dynamic(() => import('@/components/EvaluationModal'), { ssr: false });
const AdvisorModal = dynamic(() => import('@/components/AdvisorModal'), { ssr: false });
const StockManager = dynamic(() => import('@/components/StockManager'), { ssr: false });
const DietShooter = dynamic(() => import('@/components/DietShooter'), { ssr: false });
const MealRankingModal = dynamic(() => import('@/components/MealRankingModal'), { ssr: false });
const CategoryEvaluationModal = dynamic(() => import('@/components/CategoryEvaluationModal'), { ssr: false });
const ElenaChallengeModal = dynamic(() => import('@/components/ElenaChallengeModal'), { ssr: false });
const ConditionCheckIn = dynamic(() => import('@/components/ConditionCheckIn'), { ssr: false });
const DrinkQuickLog = dynamic(() => import('@/components/DrinkQuickLog'), { ssr: false });
const ConditionCard = dynamic(() => import('@/components/ConditionCard'), { ssr: false });
const ConditionModal = dynamic(() => import('@/components/ConditionModal'), { ssr: false });
const ActivityCard = dynamic(() => import('@/components/ActivityCard'), { ssr: false });
import { Camera, XCircle, ChevronLeft, ChevronRight, Calculator, Utensils, Flame, Activity, Sparkles, Loader2, LogIn, Refrigerator, Gamepad2, Trophy, Brain, Bell, BellOff } from 'lucide-react';
import PullToRefresh from 'react-simple-pull-to-refresh';

import { useAuth } from '@/lib/contexts/AuthContext';
import { addMealToFirestore, getMealsFromFirestore, deleteMealFromFirestore, getWeightsFromFirestore, getUserProfile, updateMealInFirestore, addStockItem, getStockItems, deleteStockItem, saveDailyEvaluation, getDailyEvaluation, saveConditionPrediction, getConditionLog, getConditionLogs, getConditionModel, getActivityLogs, getRecentWorkouts } from '@/lib/firebase/firestore';
import { getCache, setCache } from '@/utils/db';
import { usePushNotification } from '@/lib/usePushNotification';
import { sumMacroTotals, isNutritionallyTrivial, EXTENDED_NUTRIENTS } from '@/lib/health/nutrients';
import { evaluateCondition, toPredictedScores, toFiredDrivers, hasAnyScore, ENGINE_VERSION } from '@/lib/health/conditionEngine';
import { toDisplayableFindings } from '@/lib/health/correlation';
import { getLogicalDateKey, getSleepTargetDateKey, shiftDateKey } from '@/lib/health/conditionDate';
import { buildTrainerContextText } from '@/lib/health/trainerContext';

export default function Home() {
  const { user, logOut, googleSignIn, loading } = useAuth();
  const { isSubscribed, isSupported, isLoading: pushLoading, subscribe, unsubscribe } = usePushNotification(user?.uid);
  const [showLogger, setShowLogger] = useState(false);
  const [meals, setMeals] = useState([]);
  const [weights, setWeights] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modal States
  const [showBodyDetail, setShowBodyDetail] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [showAdvisor, setShowAdvisor] = useState(false); // New: Advisor State
  const [targetMealType, setTargetMealType] = useState('dinner'); // For Advisor
  const [showStockManager, setShowStockManager] = useState(false); // Stock Manager
  const [showGame, setShowGame] = useState(false); // Mini Game
  const [showConditionModal, setShowConditionModal] = useState(false); // コンディション内訳
  const [openBedtimeSetting, setOpenBedtimeSetting] = useState(false); // 就寝時刻の設定を開く要求
  const [conditionModel, setConditionModel] = useState(null); // 学習した個人係数（Phase 4）
  const [conditionLogs, setConditionLogs] = useState([]); // 推移グラフ＋実測睡眠の表示に使う
  const [activityLogs, setActivityLogs] = useState([]);   // HealthKit 由来の日次アクティビティ
  const [workouts, setWorkouts] = useState([]);           // HealthKit 由来のワークアウト
  const [showQuiz, setShowQuiz] = useState(false); // Elena's Challenge
  const [showRanking, setShowRanking] = useState(false); // Meal Ranking
  const [selectedCategory, setSelectedCategory] = useState(null); // 'breakfast', 'lunch', 'dinner', 'snack'
  const [stockItems, setStockItems] = useState([]); // Stock Items

  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false); // New: Delete Loading State
  const [initialRecipeSearch, setInitialRecipeSearch] = useState(null);
  const [selectedMeal, setSelectedMeal] = useState(null); // For Meal Detail Modal
  const [mealTypeMenu, setMealTypeMenu] = useState(null); // For Meal Type Selector: { mealId, x, y }

  // AI Persistence State
  const [evaluationsCache, setEvaluationsCache] = useState({}); // 日付キー -> 評価結果のキャッシュ
  const [advisorState, setAdvisorState] = useState({ suggestions: [], advice: null, targetType: 'dinner' }); // Persist Advisor
  const [recipeSearchState, setRecipeSearchState] = useState({ query: '', results: [] }); // Persist Recipe Search

  // Data Loading: IndexedDB first (instant), then Firestore sync (background)
  const loadData = React.useCallback(async (forceRefresh = false) => {
    if (!user) return;
    const uid = user.uid;

    // Step 1: Show cached data instantly
    if (!forceRefresh) {
      try {
        const [cachedMeals, cachedWeights, cachedProfile, cachedStock, cachedActivity, cachedWorkouts, cachedConditionLogs] = await Promise.all([
          getCache(`meals_${uid}`),
          getCache(`weights_${uid}`),
          getCache(`profile_${uid}`),
          getCache(`stock_${uid}`),
          getCache(`activityLogs_${uid}`),
          getCache(`workouts_${uid}`),
          getCache(`conditionLogs_${uid}`),
        ]);
        if (cachedMeals?.data) setMeals(cachedMeals.data);
        if (cachedWeights?.data) setWeights(cachedWeights.data);
        if (cachedProfile?.data) setUserProfile(cachedProfile.data);
        if (cachedStock?.data) setStockItems(cachedStock.data);
        if (cachedActivity?.data) setActivityLogs(cachedActivity.data);
        if (cachedWorkouts?.data) setWorkouts(cachedWorkouts.data);
        if (cachedConditionLogs?.data) setConditionLogs(cachedConditionLogs.data);

        // If all caches are fresh, skip Firestore
        if (cachedMeals && !cachedMeals.stale && cachedWeights && !cachedWeights.stale) {
          console.log('[Cache] All fresh, skipping Firestore');
          return;
        }
      } catch (e) { /* cache miss, continue to Firestore */ }
    }

    // Step 2: Fetch from Firestore and update cache
    try {
      const [firestoreMeals, firestoreWeights, profile, firestoreStock, firestoreActivity, firestoreWorkouts, firestoreConditionLogs] = await Promise.all([
        getMealsFromFirestore(uid),
        getWeightsFromFirestore(uid),
        getUserProfile(uid),
        getStockItems(uid),
        // HealthKit 連携の実測データ。取れなくても本体は動く（空配列で返る）
        getActivityLogs(uid, 30),
        getRecentWorkouts(uid, 30),
        getConditionLogs(uid, 30),
      ]);
      setMeals(firestoreMeals);
      setWeights(firestoreWeights);
      setStockItems(firestoreStock || []);
      setUserProfile(profile || { targetCalories: 2200 });
      setActivityLogs(firestoreActivity || []);
      setWorkouts(firestoreWorkouts || []);
      setConditionLogs(firestoreConditionLogs || []);

      // 学習済みの個人係数（無ければ一般論のまま動く）。失敗しても本体は止めない。
      getConditionModel(uid)
        .then(model => { if (model) setConditionModel(model); })
        .catch(() => {});

      // Update IndexedDB cache in background
      Promise.all([
        setCache(`meals_${uid}`, firestoreMeals),
        setCache(`weights_${uid}`, firestoreWeights),
        setCache(`profile_${uid}`, profile || { targetCalories: 2200 }),
        setCache(`stock_${uid}`, firestoreStock || []),
        setCache(`activityLogs_${uid}`, firestoreActivity || []),
        setCache(`workouts_${uid}`, firestoreWorkouts || []),
        setCache(`conditionLogs_${uid}`, firestoreConditionLogs || []),
      ]).catch(() => {});

      // Auto-evaluate in background (don't block startup)
      const unevaluatedMeals = firestoreMeals
        .filter(m => typeof m.score !== 'number')
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5);
      if (unevaluatedMeals.length > 0) {
        (async () => {
          console.log(`[AutoEval] Background: ${unevaluatedMeals.length} meals to evaluate`);
          for (const meal of unevaluatedMeals) {
            try {
              const mealDate = new Date(meal.timestamp);
              const sameDayMeals = firestoreMeals.filter(m => {
                const d = new Date(m.timestamp);
                return d.getFullYear() === mealDate.getFullYear() &&
                  d.getMonth() === mealDate.getMonth() &&
                  d.getDate() === mealDate.getDate();
              });
              const result = await evaluateSingleMeal(meal, sameDayMeals);
              if (typeof result.score === 'number') {
                await updateMealInFirestore(uid, meal.id, { score: result.score, reason: result.reason });
                setMeals(prev => prev.map(m => m.id === meal.id ? { ...m, score: result.score, reason: result.reason } : m));
              }
            } catch (err) {
              console.error(`[AutoEval] Failed: ${meal.foodName}`, err);
            }
          }
        })();
      }
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  // Lock body scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = showLogger || showBodyDetail || showEvaluation || showAdvisor || deleteConfirmation;
    if (isAnyModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open'); // Cleanup
  }, [showLogger, showBodyDetail, showEvaluation, showAdvisor, deleteConfirmation]);

  // 日付変更時にFirestoreから評価を読み込む
  useEffect(() => {
    const loadEvaluationForDate = async () => {
      if (!user) return;
      // Use Local Date Key
      const d = new Date(currentDate);
      const offset = d.getTimezoneOffset() * 60000;
      const localDate = new Date(d.getTime() - offset);
      const dateKey = localDate.toISOString().split('T')[0];

      // キャッシュにあればスキップ
      if (evaluationsCache[dateKey] !== undefined) return;

      // Firestoreから読み込み
      const saved = await getDailyEvaluation(user.uid, dateKey);
      if (saved) {
        setEvaluationsCache(prev => ({ ...prev, [dateKey]: saved }));
      } else {
        // nullを設定してFirestoreへの再問い合わせを防ぐ
        setEvaluationsCache(prev => ({ ...prev, [dateKey]: null }));
      }
    };
    loadEvaluationForDate();
  }, [user, currentDate]);

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

  // Date Utilities for Local Time Key
  const getLocalDateKey = (date) => {
    const d = new Date(date);
    const offset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() - offset);
    return localDate.toISOString().split('T')[0];
  };

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
  const currentDateKey = getLocalDateKey(currentDate);

  // Calculate Totals for Today
  // 拡張栄養素は null をスキップして合算し、`{key}Recorded` に何件分かを持つ
  // （定義は src/lib/health/nutrients.js が唯一の真実）
  const getDailyTotals = (date) => {
    const dailyMeals = meals.filter(m => isSameDay(new Date(m.timestamp), date));
    return sumMacroTotals(dailyMeals);
  };

  // FoodLoggerに渡すrecentMeals（meals stateから重複除去）
  const recentMealsForLogger = useMemo(() => {
    const seenNames = new Set();
    const unique = [];
    for (const meal of [...meals].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))) {
      if (meal.foodName && !seenNames.has(meal.foodName)) {
        seenNames.add(meal.foodName);
        unique.push(meal);
        if (unique.length >= 50) break;
      }
    }
    return unique;
  }, [meals]);

  const dayTotals = useMemo(() => getDailyTotals(currentDate), [meals, currentDate]);



  // Derived Values (memoized)
  const displayMeals = useMemo(() => meals.filter(meal => isSameDay(new Date(meal.timestamp), currentDate)), [meals, currentDate]);
  const selectedWeightEntry = useMemo(() => weights.find(w => w.date === currentDateKey), [weights, currentDateKey]);

  // --- HealthKit の実測データ（表示中の日付のぶんだけ取り出す）---
  const activityForDate = useMemo(
    () => activityLogs.find(a => a.date === currentDateKey) || null,
    [activityLogs, currentDateKey]
  );
  const workoutsForDate = useMemo(
    () => workouts.filter(w => w.date === currentDateKey),
    [workouts, currentDateKey]
  );
  // 睡眠は「その夜を引き起こした食事の日」に紐づいている（conditionDate.js 参照）。
  // 今日を見ている時はまだ今夜が来ていないので、直近で完了した夜＝前日キーを出す。
  const sleepForDate = useMemo(() => {
    const key = isToday(currentDate) ? getSleepTargetDateKey() : currentDateKey;
    return conditionLogs.find(l => l.date === key)?.sleep?.objective || null;
  }, [conditionLogs, currentDate, currentDateKey]);

  // 上段の要約カードは常に体重を出したい。その日に体組成計に乗っていなければ
  // 直近の測定値で代用する（体重は毎日測るものではないため）。
  const latestWeightEntry = useMemo(
    () => (weights.length > 0 ? [...weights].sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null),
    [weights]
  );
  const bodyForCompactCard = selectedWeightEntry || latestWeightEntry;

  const weightGoal = useMemo(() => {
    const current = bodyForCompactCard?.weight;
    if (!userProfile?.targetWeight || !current) return null;
    return {
      current,
      target: userProfile.targetWeight,
      // startWeight は目標を立てた時点の体重。未設定の日は進捗バーを出さない
      start: userProfile.startWeight ?? null,
      targetDate: userProfile.targetDate,
    };
  }, [bodyForCompactCard, userProfile]);
  // ===== コンディション予測（決定論エンジン。API呼び出しなしで即時更新される） =====
  // 日付は「論理日」(4:00区切り)。深夜の食事を前日の夜として扱うため、
  // ダッシュボードのカレンダー日とは意図的にずらしている。
  const conditionInput = useMemo(() => {
    if (isToday(currentDate)) {
      return { dateKey: getLogicalDateKey(new Date()), now: new Date() };
    }
    // 過去日は「その日が終わった時点」で評価する
    const dateKey = getLocalDateKey(currentDate);
    const endOfLogicalDay = new Date(currentDate);
    endOfLogicalDay.setHours(23, 59, 0, 0);
    return { dateKey, now: endOfLogicalDay };
  }, [currentDate]);

  const conditionResult = useMemo(() => evaluateCondition({
    dateKey: conditionInput.dateKey,
    meals,
    profile: {
      bedtime: userProfile?.bedtime,
      targetCalories: userProfile?.targetCalories,
      currentWeight: selectedWeightEntry?.weight ?? userProfile?.currentWeight,
    },
    now: conditionInput.now,
    // 学習済みなら個人係数を適用（未学習なら一般論のまま）
    driverWeights: conditionModel?.driverWeights || null,
  }), [conditionInput, meals, userProfile, selectedWeightEntry, conditionModel]);

  // 日次評価に1行だけ渡す要約。エレナがダッシュボードと矛盾したことを言わないようにする。
  const conditionSummary = useMemo(() => {
    if (!hasAnyScore(conditionResult)) return null;
    const a = conditionResult.axes;
    const part = (label, data) => (data?.score != null ? `${label}${data.score}` : null);
    const line = [
      part('集中力', a.focus), part('睡眠', a.sleep),
      part('エネルギー', a.energy), part('メンタル', a.mood),
    ].filter(Boolean).join(' / ');
    if (!line) return null;
    const top = conditionResult.topNegative ? `（最も響いている要因: ${conditionResult.topNegative.label}）` : '';
    return `${line}${top}`;
  }, [conditionResult]);

  // 睡眠・集中力などの実測データをエレナの日次評価に渡す（生活全体のトレーナー化）。
  // 「昨夜の睡眠」は論理日-1のログに入っている（conditionDate.js の帰属ルール）。
  const trainerContext = useMemo(() => {
    const logicalKey = conditionInput.dateKey;
    const sleepKey = shiftDateKey(logicalKey, -1);
    return buildTrainerContextText({
      todayLog: conditionLogs.find(l => l.date === logicalKey) || null,
      sleepLog: conditionLogs.find(l => l.date === sleepKey) || null,
      bedtime: userProfile?.bedtime || null,
      activity: activityForDate,
      findings: toDisplayableFindings(conditionModel),
    });
  }, [conditionInput.dateKey, conditionLogs, userProfile?.bedtime, activityForDate, conditionModel]);

  // エレナの解説はモーダルを開いた時だけ取得する（食事追加ごとには呼ばない）
  const handleRequestConditionAnalysis = useCallback(async (result) => {
    if (!user?.uid) return null;
    const conditionLog = await getConditionLog(user.uid, conditionInput.dateKey);
    return analyzeCondition(result, {
      meals: displayMeals.map(m => ({
        foodName: m.foodName, calories: m.calories,
        timestamp: m.timestamp, mealType: m.mealType,
      })),
      conditionLog,
      findings: toDisplayableFindings(conditionModel),
    });
  }, [user?.uid, conditionInput.dateKey, displayMeals, conditionModel]);

  // 推移グラフ用の履歴。モーダルを開くまで読み込まない（普段は無駄なので）
  useEffect(() => {
    if (!showConditionModal || !user?.uid) return;
    getConditionLogs(user.uid, 30)
      .then(setConditionLogs)
      .catch(() => {});
  }, [showConditionModal, user?.uid]);

  // 予測を日次スナップショットとして保存する。
  // ルールを後から改訂しても過去の予測が書き換わらず、Phase 4 の相関分析が壊れない。
  const lastSavedPredictionRef = useRef(null);
  useEffect(() => {
    if (!user?.uid || !isToday(currentDate)) return;
    if (!hasAnyScore(conditionResult)) return;

    const predicted = toPredictedScores(conditionResult);
    const firedDrivers = toFiredDrivers(conditionResult);
    const signature = `${conditionInput.dateKey}:${JSON.stringify(predicted)}:${JSON.stringify(firedDrivers)}`;
    if (lastSavedPredictionRef.current === signature) return;
    lastSavedPredictionRef.current = signature;

    saveConditionPrediction(user.uid, conditionInput.dateKey, predicted, ENGINE_VERSION, firedDrivers)
      .catch(e => console.warn('[Condition] prediction save failed:', e));
  }, [user?.uid, currentDate, conditionResult, conditionInput.dateKey]);


  // --- Dynamic Calorie Target Logic ---
  const baseTarget = userProfile?.targetCalories || 2200;
  const dailyTarget = useMemo(() => {
    if (!userProfile?.targetCalories) return 2200;
    let balance = 0;
    for (let i = 1; i <= 3; i++) {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - i);
      const totals = getDailyTotals(d);
      const hasData = meals.some(m => isSameDay(new Date(m.timestamp), d));
      if (hasData) {
        balance += (totals.calories - userProfile.targetCalories);
      }
    }
    const adjustment = Math.round(balance / 3);
    const dynamicTarget = userProfile.targetCalories - adjustment;
    if (dynamicTarget < 1200) return 1200;
    if (dynamicTarget > userProfile.targetCalories + 500) return userProfile.targetCalories + 500;
    return Math.round(dynamicTarget);
  }, [meals, currentDate, userProfile]);
  const isAdjusted = dailyTarget !== baseTarget;

  // Prepare History for AI Context
  const getHistorySummary = useCallback(() => {
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
  }, [meals, baseTarget]);

  const totalCalories = displayMeals.reduce((acc, meal) => acc + Number(meal.calories || 0), 0);
  const targetCalories = userProfile?.targetCalories || 2200;
  const remaining = Math.max(0, targetCalories - totalCalories);

  // エレナの表情・メッセージを記録状況に応じて計算
  const elenaState = useMemo(() => {
    const savedEval = evaluationsCache[currentDateKey];
    if (savedEval?.score !== undefined && savedEval.score !== null) {
      const s = savedEval.score;
      if (s === 100) return { imageSrc: "/images/elena/elena_score_100.webp", message: savedEval.title || "完璧な一日！パーフェクト✨", score: s };
      if (s >= 90) return { imageSrc: "/images/elena/elena_score_90_99.webp", message: savedEval.title || "素晴らしい！もうちょっとで満点！", score: s };
      if (s >= 75) return { imageSrc: "/images/elena/elena_score_75_90.webp", message: savedEval.title || "いい調子！この調子でいきましょう！", score: s };
      if (s >= 50) return { imageSrc: "/images/elena.webp", message: savedEval.title || "まあまあですね。もう少し頑張りましょう！", score: s };
      if (s >= 20) return { imageSrc: "/images/elena/elena_score_20_50.webp", message: savedEval.title || "ちょっと心配です…頑張ってくださいね！", score: s };
      return { imageSrc: "/images/elena/elena_score_0_20.webp", message: savedEval.title || "もっと気をつけてください！！", score: s };
    }
    const ratio = targetCalories > 0 ? totalCalories / targetCalories : 0;
    if (totalCalories === 0) return { imageSrc: "/images/elena/elena_score_20_50.webp", message: "まだ何も食べていませんよ！記録してくださいね🍽️", score: null };
    if (ratio < 0.5) return { imageSrc: "/images/elena/elena_score_20_50.webp", message: "もっと食べないとダメですよ！バランスよくいきましょう💪", score: null };
    if (ratio < 0.8) return { imageSrc: "/images/elena.webp", message: "いい感じ！この調子でいきましょう！😊", score: null };
    if (ratio <= 1.0) return { imageSrc: "/images/elena/elena_score_75_90.webp", message: "目標達成目前！あと少し頑張りましょう！🔥", score: null };
    if (ratio <= 1.1) return { imageSrc: "/images/elena/elena_score_75_90.webp", message: "目標カロリー達成！今日もよく頑張りましたね✨", score: null };
    if (ratio <= 1.3) return { imageSrc: "/images/elena/elena_score_20_50.webp", message: "ちょっと食べすぎかもしれません…気をつけてくださいね！🤔", score: null };
    return { imageSrc: "/images/elena/elena_score_0_20.webp", message: "食べすぎ警報！！明日はしっかり管理しましょう！😤", score: null };
  }, [evaluationsCache, currentDateKey, totalCalories, targetCalories]);

  // Statistics for Leon (memoized)
  const { avgCal3Days, streakDays } = useMemo(() => {
    let totalCal3Days = 0;
    let daysWithData = 0;
    for (let i = 1; i <= 3; i++) {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - i);
      const hasData = meals.some(m => isSameDay(new Date(m.timestamp), d));
      if (hasData) {
        totalCal3Days += getDailyTotals(d).calories;
        daysWithData++;
      }
    }
    const avgCal3Days = daysWithData > 0 ? Math.round(totalCal3Days / daysWithData) : 0;

    let streak = 0;
    if (displayMeals.length > 0) streak++;
    for (let i = 1; i <= 45; i++) {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - i);
      const hasData = meals.some(m => isSameDay(new Date(m.timestamp), d));
      if (hasData) { streak++; } else { break; }
    }
    return { avgCal3Days, streakDays: streak };
  }, [meals, currentDate, displayMeals]);

  // Evaluation Data Prep (memoized)
  const evaluationData = useMemo(() => ({
    avgCal3Days,
    streakDays,
    date: currentDate.toISOString(),
    consumedCalories: dayTotals.calories,
    macros: {
      protein: dayTotals.protein,
      fat: dayTotals.fat,
      carbs: dayTotals.carbs
    },
    targetCalories: targetCalories,
    baseTargetCalories: baseTarget,
    historySummary: getHistorySummary(),
    meals: displayMeals.map(m => ({
      foodName: m.foodName,
      calories: m.calories,
      macros: m.macros,
      timestamp: m.timestamp,
      mealType: m.mealType,
    })),
    currentWeight: selectedWeightEntry?.weight,
    targetWeight: userProfile?.targetWeight,
    targetDate: userProfile?.targetDate,
    // コンディション予測（1行）と生活データ（実測）。エレナが生活全体を評価する材料
    conditionSummary,
    trainerContext,
  }), [avgCal3Days, streakDays, currentDate, dayTotals, targetCalories, baseTarget, displayMeals, selectedWeightEntry, userProfile, getHistorySummary, conditionSummary, trainerContext]);

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
        const sorted = combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setCache(`meals_${user.uid}`, sorted).catch(() => {});
        return sorted;
      });

      // 3. Background Evaluation (batched with Promise.all)
      const existingMealsToday = meals.filter(meal => isSameDay(new Date(meal.timestamp), currentDate));
      const allMealsForContext = [...existingMealsToday, ...newMeals];

      // 水・お茶・ブラックコーヒーのようにカロリーもマクロもほぼゼロの記録は、
      // 1日のカロリー/PFC評価を数値的に動かさないので Gemini を呼ばない。
      // カフェインはコンディションエンジン（決定論・API不要）が拾うため精度は落ちない。
      const scoreTrivially = (m, id) =>
        Promise.resolve({ evalResult: { score: 5, reason: '水分補給ですね💧' }, id });

      // Evaluate new meals in parallel
      const newMealEvals = adjustedMeals.map((m, index) =>
        isNutritionallyTrivial(m)
          ? scoreTrivially(m, addedIds[index])
          : evaluateSingleMeal({ ...m, id: addedIds[index] }, allMealsForContext)
            .then(evalResult => ({ evalResult, id: addedIds[index] }))
            .catch(() => null)
      );

      // Re-evaluate existing meals only if they don't have scores yet
      const existingEvals = existingMealsToday
        .filter(m => typeof m.score !== 'number' && !isNutritionallyTrivial(m))
        .map(existingMeal =>
          evaluateSingleMeal(existingMeal, allMealsForContext)
            .then(evalResult => ({ evalResult, id: existingMeal.id }))
            .catch(() => null)
        );

      // Fire all evaluations in parallel, update as they resolve
      Promise.all([...newMealEvals, ...existingEvals]).then(async (results) => {
        for (const r of results) {
          if (!r || !r.evalResult || typeof r.evalResult.score !== 'number') continue;
          const updates = {
            score: r.evalResult.score,
            reason: r.evalResult.reason,
            assessment: r.evalResult.score >= 8 ? 'positive' : (r.evalResult.score <= 3 ? 'negative' : 'neutral')
          };
          await updateMealInFirestore(user.uid, r.id, updates);
          setMeals(prev => prev.map(p => p.id === r.id ? { ...p, ...updates } : p));
        }

        // 追加したものが全て「水分だけ」なら1日の評価は変わらないので日次評価を回さない。
        // 日次評価はこのアプリで最も高価な呼び出し（thinking込み）なので効果が大きい。
        if (adjustedMeals.every(isNutritionallyTrivial)) {
          return;
        }

        // Background: Run daily evaluation after individual evaluations complete
        const dateKey = getLocalDateKey(currentDate);
        const allMealsToday = [...allMealsForContext];
        const consumedCalories = allMealsToday.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);
        try {
          const dailyResult = await evaluateDailyLog({
            date: dateKey,
            consumedCalories,
            targetCalories: userProfile?.targetCalories || 2200,
            meals: allMealsToday.map(m => ({
              foodName: m.foodName,
              calories: m.calories,
              macros: m.macros,
              timestamp: m.timestamp,
              mealType: m.mealType,
            })),
            currentWeight: userProfile?.currentWeight,
            targetWeight: userProfile?.targetWeight,
            targetDate: userProfile?.targetDate,
            // コンディション予測を1行だけ渡し、エレナの発言が別画面と矛盾しないようにする
            conditionSummary,
            // 睡眠・集中力などの実測データ（生活全体のトレーナーとして語らせる）
            trainerContext,
          });
          if (dailyResult && !dailyResult.error) {
            await saveDailyEvaluation(user.uid, dateKey, dailyResult);
            setEvaluationsCache(prev => ({ ...prev, [dateKey]: dailyResult }));
          }
        } catch (e) {
          console.warn('[AutoEval] Daily evaluation failed:', e.message);
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
      // Optimistic local update (no re-fetch needed)
      setMeals(prev => {
        const updated = prev.filter(m => m.id !== deleteConfirmation.id);
        setCache(`meals_${user.uid}`, updated).catch(() => {});
        return updated;
      });
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

  const StatCard = ({ title, value, unit, icon, color, onClick, subtext, current, target, weightProgress }) => {
    // Calculate progress for calorie gauge
    const showGauge = typeof current === 'number' && typeof target === 'number' && target > 0;
    const progress = showGauge ? Math.min((current / target) * 100, 150) : 0;
    const isOver = showGauge && current > target;
    const remaining = showGauge ? target - current : 0;

    // Weight progress (reduction goal)
    const showWeightProgress = weightProgress && typeof weightProgress.current === 'number' && typeof weightProgress.target === 'number';
    const weightRemaining = showWeightProgress ? (weightProgress.current - weightProgress.target).toFixed(1) : 0;
    const weightStart = weightProgress?.start || weightProgress?.current;
    const totalToLose = showWeightProgress ? (weightStart - weightProgress.target) : 0;
    const alreadyLost = showWeightProgress ? (weightStart - weightProgress.current) : 0;
    const weightProgressPercent = totalToLose > 0 ? Math.min(100, (alreadyLost / totalToLose) * 100) : 0;
    const isWeightAchieved = showWeightProgress && weightProgress.current <= weightProgress.target;

    // Days remaining and required pace calculation
    let daysRemaining = null;
    let requiredPacePerWeek = null;
    if (showWeightProgress && weightProgress.targetDate) {
      const targetDateObj = new Date(weightProgress.targetDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = targetDateObj.getTime() - today.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      if (daysRemaining > 0 && parseFloat(weightRemaining) > 0) {
        const weeksRemaining = daysRemaining / 7;
        requiredPacePerWeek = (parseFloat(weightRemaining) / weeksRemaining).toFixed(2);
      }
    }

    // SVG gauge parameters
    const size = 60; // Reduced from 70 for mobile fit
    const strokeWidth = 6; // Slightly thinner
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    // For calorie gauge
    const progressOffset = circumference - (Math.min(progress, 100) / 100) * circumference;
    // For weight gauge
    const weightProgressOffset = circumference - (Math.min(weightProgressPercent, 100) / 100) * circumference;

    // Color based on progress
    const getGaugeColor = () => {
      if (isOver) return '#F56565';
      if (progress >= 85) return '#48BB78';
      if (progress >= 50) return '#ECC94B';
      return '#4299E1';
    };

    // Color for weight progress
    const getWeightGaugeColor = () => {
      if (isWeightAchieved) return '#48BB78'; // Green - goal achieved!
      if (weightProgressPercent >= 75) return '#48BB78'; // Green - close to goal
      if (weightProgressPercent >= 40) return '#4ECDC4'; // Teal - good progress
      if (weightProgressPercent >= 10) return '#ECC94B'; // Yellow - some progress
      return '#4299E1'; // Blue - just starting
    };

    return (
      <div onClick={onClick} className="glass-panel hover-card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '5px', cursor: onClick ? 'pointer' : 'default', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: (showGauge || showWeightProgress) ? '0' : '8px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{title}</span>
          {!showGauge && !showWeightProgress && icon && React.cloneElement(icon, { size: 18, color: color || 'var(--text-muted)' })}
        </div>

        {showWeightProgress ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Current Weight - Large Display */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{unit}</span>
            </div>

            {/* Progress Arrow: Current → Target */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: isWeightAchieved ? 'rgba(72, 187, 120, 0.1)' : 'rgba(78, 205, 196, 0.1)', borderRadius: '10px' }}>
              {/* Remaining kg badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '50px',
                padding: '4px 8px',
                background: isWeightAchieved ? '#48BB78' : '#4ECDC4',
                borderRadius: '8px',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.85rem'
              }}>
                {isWeightAchieved ? '✓' : `-${weightRemaining}`}
              </div>

              {/* Arrow and target */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
                  <path d="M0 6H18M18 6L13 1M18 6L13 11" stroke={isWeightAchieved ? '#48BB78' : '#4ECDC4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: isWeightAchieved ? '#48BB78' : '#4ECDC4' }}>
                  {weightProgress.target} {unit}
                </span>
                {isWeightAchieved && <span style={{ fontSize: '0.8rem' }}>🎉</span>}
              </div>
            </div>

            {/* Days remaining and required pace */}
            {daysRemaining !== null && !isWeightAchieved && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', paddingTop: '4px' }}>
                <span>📅 あと {daysRemaining} 日</span>
                {requiredPacePerWeek && <span>⚡ 週 {requiredPacePerWeek} kg/週</span>}
              </div>
            )}
          </div>
        ) : showGauge ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Circular Gauge for Calories */}
            <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
              <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EDF2F7" strokeWidth={strokeWidth} />
                <circle
                  cx={size / 2} cy={size / 2} r={radius} fill="none"
                  stroke={getGaugeColor()}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={progressOffset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: getGaugeColor() }}>
                  {Math.round(progress)}%
                </span>
              </div>
            </div>

            {/* Calorie Values */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: isOver ? '#F56565' : 'var(--text-primary)' }}>{value}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{unit}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                目標: {target} {unit}
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isOver ? '#F56565' : '#48BB78', marginTop: '2px' }}>
                {isOver ? `+${Math.floor(Math.abs(remaining))} ${unit} オーバー` : `残り ${Math.floor(remaining)} ${unit}`}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{unit}</span>
            </div>
            {subtext && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{subtext}</div>}
          </>
        )}
      </div>
    );
  };


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
      <PullToRefresh onRefresh={() => loadData(true)} pullingContent="" refreshingContent={<div style={{ padding: '20px', textAlign: 'center' }}><Loader2 className="spin" /></div>}>
        <div style={{ minHeight: '80vh' }}>

          {/* Header */}
          <header style={{ marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></div>
                <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.5px' }}>LifeLog</h1>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                <button onClick={() => setShowStockManager(true)} style={{ background: 'white', border: '1px solid var(--border-subtle)', padding: '4px 8px', borderRadius: '16px', fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                  <Refrigerator size={12} /> Stock
                </button>
                <button onClick={() => setShowQuiz(true)} style={{ background: 'white', border: '1px solid var(--border-subtle)', padding: '4px 8px', borderRadius: '16px', fontSize: '0.7rem', color: '#ED8936', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                  <Brain size={12} /> Quiz
                </button>
                <button onClick={() => setShowRanking(true)} style={{ background: 'white', border: '1px solid var(--border-subtle)', padding: '4px 8px', borderRadius: '16px', fontSize: '0.7rem', color: '#805AD5', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                  <Trophy size={12} /> Ranking
                </button>
                {isSupported && (
                  <button onClick={() => isSubscribed ? unsubscribe() : subscribe()} disabled={pushLoading} style={{ background: isSubscribed ? 'var(--primary-glow)' : 'var(--bg-card)', border: `1px solid ${isSubscribed ? 'var(--primary)' : 'var(--border-subtle)'}`, padding: '4px 8px', borderRadius: '16px', fontSize: '0.7rem', color: isSubscribed ? 'var(--primary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                    {isSubscribed ? <Bell size={12} /> : <BellOff size={12} />} {isSubscribed ? '通知ON' : '通知'}
                  </button>
                )}
                <button onClick={() => logOut && logOut()} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', padding: '4px 8px', borderRadius: '16px', fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Logout</button>
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

          {/* Elena Banner */}
          <div
            onClick={() => setShowEvaluation(true)}
            style={{ position: 'relative', marginBottom: '20px', background: 'white', borderRadius: '20px', padding: '14px 130px 14px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden', cursor: 'pointer', minHeight: '90px' }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Elena{elenaState.score !== null ? ` · スコア ${elenaState.score}` : ''}
            </div>
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {elenaState.message}
            </p>
            <div style={{ marginTop: '6px', fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600 }}>
              タップで詳細評価 →
            </div>
            <img
              src={elenaState.imageSrc}
              alt="Elena"
              style={{ position: 'absolute', right: '-10px', bottom: '-5px', width: '130px', height: 'auto', pointerEvents: 'none' }}
            />
          </div>

          {/* Dashboard Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
            <StatCard
              title="摂取カロリー"
              value={totalCalories}
              unit="kcal"
              icon={<Flame />}
              color="#FF6B6B"
              current={totalCalories}
              target={targetCalories}
              onClick={() => {
                // Always open evaluation, regardless of meal completion
                setShowEvaluation(true);
              }}
            />



            {/* 実測（体重・歩数）と目標をまとめた要約カード。タップで詳細 */}
            <ActivityCard
              compact
              title={isToday(currentDate) ? '今日のからだ' : 'この日のからだ'}
              activity={activityForDate}
              body={bodyForCompactCard}
              goal={weightGoal}
              onOpenDetail={() => setShowBodyDetail(true)}
            />
          </div>

          {/* PFC Balance Card */}
          <div className="glass-panel" style={{ padding: '20px', marginBottom: '25px' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="var(--primary)" /> PFCバランス
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {[
                { label: 'タンパク質(P)', key: 'protein', color: '#48BB78', targetRatio: 0.2, kcalPerG: 4 }, // 20%
                { label: '脂質(F)', key: 'fat', color: '#ECC94B', targetRatio: 0.3, kcalPerG: 9 },     // 30%
                { label: '炭水化物(C)', key: 'carbs', color: '#4299E1', targetRatio: 0.5, kcalPerG: 4 }   // 50%
              ].map((macro) => {
                const totalG = displayMeals.reduce((acc, m) => {
                  const val = Number(m.macros?.[macro.key]);
                  return acc + (isNaN(val) ? 0 : val);
                }, 0);
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


          {/* 拡張栄養素カード（fiber/sugar/sodium/potassium） */}
          {displayMeals.length > 0 && (
            <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '25px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Flame size={15} color="var(--primary)" /> ダイエット関連栄養素
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { label: '食物繊維', key: 'fiber', unit: 'g', target: 20, color: '#68D391', tip: '目標20g' },
                  { label: '糖質', key: 'sugar', unit: 'g', target: null, color: '#FC8181', tip: null },
                  { label: 'ナトリウム', key: 'sodium', unit: 'mg', target: 2500, color: '#63B3ED', tip: '目標2500mg以下' },
                  { label: 'カリウム', key: 'potassium', unit: 'mg', target: 2500, color: '#B794F4', tip: '目標2500mg以上' },
                ].map(({ label, key, unit, target, color, tip }) => {
                  const val = dayTotals[key];
                  const hasData = dayTotals[key + 'Recorded'] !== undefined
                    ? dayTotals[key + 'Recorded'] > 0
                    : displayMeals.some(m => m.macros?.[key] != null);
                  const displayVal = hasData ? `${Math.round(val)}${unit}` : '―';
                  const percent = target && hasData ? Math.min(100, (val / target) * 100) : null;
                  return (
                    <div key={key} style={{ background: 'var(--bg-main)', borderRadius: '10px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: percent != null ? '6px' : '0' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: hasData ? 'var(--text-primary)' : 'var(--text-muted)' }}>{displayVal}</span>
                      </div>
                      {percent != null && (
                        <div style={{ height: '4px', background: '#EDF2F7', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${percent}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                        </div>
                      )}
                      {tip && hasData && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '3px' }}>{tip}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {displayMeals.some(m => m.macros?.fiber == null && m.macros?.sodium == null) && (
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '8px 0 0', textAlign: 'right' }}>― は未取得（AI解析時に自動記録されます）</p>
              )}
            </div>
          )}

          {/* コンディション予測（4軸ミニゲージ） */}
          <ConditionCard
            result={conditionResult}
            onOpenDetail={() => setShowConditionModal(true)}
            needsBedtime={isToday(currentDate) && !userProfile?.bedtime}
            onRequestBedtime={() => setOpenBedtimeSetting(true)}
          />

          {/* 体感チェックイン + マイドリンク（今日のみ。過去日を見ている時は聞かない） */}
          {isToday(currentDate) && (
            <>
              <ConditionCheckIn
                user={user}
                userProfile={userProfile}
                openSettings={openBedtimeSetting}
                onSettingsHandled={() => setOpenBedtimeSetting(false)}
                onProfileUpdate={(patch) => setUserProfile(prev => ({ ...(prev || {}), ...patch }))}
              />
              <DrinkQuickLog user={user} onLogDrink={handleLogMeal} />
            </>
          )}

          {/* Meal Timeline - Grouped by Meal Type */}
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Utensils size={18} /> 食事の記録
            </h3>

            {displayMeals.length === 0 ? (
              <div className="empty-state">
                <p>記録がありません</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Group meals by type */}
                {(() => {
                  const mealCategories = [
                    { type: 'breakfast', label: '🌅 朝食', color: '#F6AD55' },
                    { type: 'lunch', label: '☀️ 昼食', color: '#68D391' },
                    { type: 'dinner', label: '🌙 夕食', color: '#805AD5' },
                    { type: 'snack', label: '🍪 間食', color: '#FC8181' }
                  ];

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

                  return mealCategories.map(category => {
                    const categoryMeals = displayMeals.filter(m => (m.mealType || 'snack') === category.type);
                    if (categoryMeals.length === 0) return null;

                    const categoryTotalCal = categoryMeals.reduce((acc, m) => { const v = Number(m.calories); return acc + (isNaN(v) ? 0 : v); }, 0);
                    const categoryTotalP = categoryMeals.reduce((acc, m) => { const v = Number(m.macros?.protein); return acc + (isNaN(v) ? 0 : v); }, 0);
                    const categoryTotalF = categoryMeals.reduce((acc, m) => { const v = Number(m.macros?.fat); return acc + (isNaN(v) ? 0 : v); }, 0);
                    const categoryTotalC = categoryMeals.reduce((acc, m) => { const v = Number(m.macros?.carbs); return acc + (isNaN(v) ? 0 : v); }, 0);

                    return (
                      <div key={category.type} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {/* Category Header */}
                        <div
                          onClick={() => setSelectedCategory(category.type)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: `linear-gradient(135deg, ${category.color}15, ${category.color}08)`, borderRadius: '12px', borderLeft: `4px solid ${category.color}`, cursor: 'pointer', transition: 'transform 0.1s ease', ':active': { transform: 'scale(0.98)' } }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{category.label}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'white', padding: '2px 8px', borderRadius: '10px' }}>{categoryMeals.length}品</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                              {categoryTotalCal} <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)' }}>kcal</span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <span>P:{categoryTotalP.toFixed(0)}g</span>
                              <span>F:{categoryTotalF.toFixed(0)}g</span>
                              <span>C:{categoryTotalC.toFixed(0)}g</span>
                            </div>
                          </div>
                        </div>

                        {/* Meal Items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '10px' }}>
                          {categoryMeals.map((meal) => {
                            const scoreStyle = getMealScoreStyle(meal);

                            return (
                              <div key={meal.id || meal.timestamp} className="glass-panel hover-card" onClick={() => setSelectedMeal(meal)} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '14px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)', background: scoreStyle.background, borderLeft: scoreStyle.borderLeft || `3px solid ${category.color}40`, transition: 'all 0.3s ease', cursor: 'pointer' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                  {/* Time */}
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', minWidth: '40px' }}>
                                    {new Date(meal.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                  </span>

                                  {/* Score Badge */}
                                  <div style={{ width: '32px', height: '32px', minWidth: '32px', background: scoreStyle.scoreDisplay !== null ? scoreStyle.background : 'var(--bg-main)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: scoreStyle.scoreDisplay !== null ? scoreStyle.scoreColor : 'var(--primary)', fontWeight: 700, fontSize: '0.9rem', border: scoreStyle.scoreDisplay !== null ? `2px solid ${scoreStyle.scoreColor}` : 'none', flexShrink: 0 }}>
                                    {scoreStyle.scoreDisplay !== null ? scoreStyle.scoreDisplay : <Utensils size={14} />}
                                  </div>

                                  {/* Food Name & Macros */}
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{meal.foodName}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                                      <span>P:{meal.macros?.protein || 0}g</span>
                                      <span>F:{meal.macros?.fat || 0}g</span>
                                      <span>C:{meal.macros?.carbs || 0}g</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Calories & Delete */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                                    {meal.calories} <span style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--text-muted)' }}>kcal</span>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setMealTypeMenu({ mealId: meal.id, currentType: meal.mealType || 'snack', x: rect.left, y: rect.bottom + 5 });
                                    }}
                                    style={{ fontSize: '0.65rem', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'white', cursor: 'pointer', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}
                                    title="食事タイプを変更"
                                  >
                                    変更
                                  </button>
                                  <button onClick={(e) => handleDeleteMeal(meal.id, e)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.5, padding: '4px' }}>
                                    <XCircle size={16} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }).filter(Boolean); // Remove nulls (empty categories)
                })()}
              </div>
            )}
          </div>

        </div>
      </PullToRefresh>

      {/* --- Modals --- */}

      {showRanking && <MealRankingModal meals={meals} onClose={() => setShowRanking(false)} />}

      {selectedCategory && (
        <CategoryEvaluationModal
          category={selectedCategory}
          meals={displayMeals}
          stockItems={stockItems}
          savedResult={evaluationsCache[`${getLocalDateKey(currentDate)}_${selectedCategory}`]}
          onSave={(newRes) => setEvaluationsCache(prev => ({ ...prev, [`${getLocalDateKey(currentDate)}_${selectedCategory}`]: newRes }))}
          onClose={() => setSelectedCategory(null)}
        />
      )}

      {/* Meal Type Selector Popup */}
      {mealTypeMenu && (
        <div className="fixed-overlay" style={{ zIndex: 2500, background: 'rgba(0,0,0,0.2)' }} onClick={() => setMealTypeMenu(null)}>
          <div
            className="glass-panel zoom-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: Math.min(mealTypeMenu.x, window.innerWidth - 160),
              top: Math.min(mealTypeMenu.y, window.innerHeight - 200),
              padding: '8px',
              minWidth: '140px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
            }}
          >
            {[
              { type: 'breakfast', label: '🌅 朝食', color: '#F6AD55' },
              { type: 'lunch', label: '☀️ 昼食', color: '#68D391' },
              { type: 'dinner', label: '🌙 夕食', color: '#805AD5' },
              { type: 'snack', label: '🍪 間食', color: '#FC8181' }
            ].map((option) => (
              <button
                key={option.type}
                onClick={async () => {
                  const targetMealId = mealTypeMenu.mealId;
                  const previousType = mealTypeMenu.currentType;
                  const newType = option.type;

                  // Close menu immediately
                  setMealTypeMenu(null);

                  if (newType === previousType) return; // No change

                  // 1. Optimistic Update
                  setMeals(prev => prev.map(m => m.id === targetMealId ? { ...m, mealType: newType } : m));

                  // 2. Background Update
                  try {
                    await updateMealInFirestore(user.uid, targetMealId, { mealType: newType });

                    // Trigger Re-evaluation of the same day meals with updated context
                    const targetMeal = meals.find(m => m.id === targetMealId);
                    if (targetMeal) {
                      const targetDate = new Date(targetMeal.timestamp);
                      const sameDayMeals = meals.filter(m => isSameDay(new Date(m.timestamp), targetDate))
                        .map(m => m.id === targetMealId ? { ...m, mealType: newType } : m);

                      sameDayMeals.forEach(async (m) => {
                        const reEvalResult = await evaluateSingleMeal(m, sameDayMeals);
                        if (reEvalResult && typeof reEvalResult.score === 'number') {
                          const updates = {
                            score: reEvalResult.score,
                            reason: reEvalResult.reason,
                            assessment: reEvalResult.score >= 8 ? 'positive' : (reEvalResult.score <= 3 ? 'negative' : 'neutral')
                          };
                          await updateMealInFirestore(user.uid, m.id, updates);
                          setMeals(prev => prev.map(p => p.id === m.id ? { ...p, ...updates } : p));
                        }
                      });
                    }
                  } catch (err) {
                    console.error("Failed to update meal type", err);
                    // Revert
                    setMeals(prev => prev.map(m => m.id === targetMealId ? { ...m, mealType: previousType } : m));
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 12px',
                  background: mealTypeMenu.currentType === option.type ? `${option.color}20` : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: mealTypeMenu.currentType === option.type ? 600 : 400,
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                  transition: 'background 0.15s'
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: option.color }}></span>
                {option.label}
                {mealTypeMenu.currentType === option.type && <span style={{ marginLeft: 'auto', color: option.color }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}


      {/* Meal Detail Modal */}
      {selectedMeal && (
        <div className="fixed-overlay" style={{ zIndex: 1500 }} onClick={() => setSelectedMeal(null)}>
          <div className="glass-panel zoom-in" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '400px', padding: '25px', textAlign: 'center' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '10px' }}>
                {selectedMeal.score >= 8 ? '🌟' : selectedMeal.score >= 5 ? '👍' : selectedMeal.score >= 3 ? '⚠️' : '💔'}
              </div>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>{selectedMeal.foodName}</h3>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <span>{selectedMeal.calories} kcal</span>
                <span>P: {selectedMeal.macros?.protein || 0}g</span>
                <span>F: {selectedMeal.macros?.fat || 0}g</span>
                <span>C: {selectedMeal.macros?.carbs || 0}g</span>
              </div>

              {/* 拡張栄養素（定義は nutrients.js が唯一の真実。フィールドを足せばここにも自動で出る）
                  値が null＝AIが推定できなかった項目は表示しない */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 12px', marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {EXTENDED_NUTRIENTS.map(({ key, label, unit }) => {
                  const value = selectedMeal.macros?.[key];
                  if (value == null) return null;
                  const rounded = Math.round(Number(value) * 10) / 10;
                  return <span key={key}>{label}: {rounded}{unit}</span>;
                })}
              </div>
            </div>

            <div style={{ background: 'var(--bg-main)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: selectedMeal.score >= 7 ? '#48BB78' : selectedMeal.score >= 4 ? '#ECC94B' : '#F56565', marginBottom: '10px' }}>
                {typeof selectedMeal.score === 'number' ? `${selectedMeal.score}/10` : '---'}
              </div>
              <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                {selectedMeal.reason || (typeof selectedMeal.score !== 'number' ? '評価中...' : 'この食事の評価理由は記録されていません')}
              </p>
              {!selectedMeal.reason && typeof selectedMeal.score === 'number' && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      // 同じ日の食事をcontextとして渡す
                      const result = await evaluateSingleMeal(selectedMeal, displayMeals);
                      if (result.reason) {
                        await updateMealInFirestore(user.uid, selectedMeal.id, { score: result.score, reason: result.reason });
                        setMeals(prev => prev.map(m => m.id === selectedMeal.id ? { ...m, score: result.score, reason: result.reason } : m));
                        setSelectedMeal(prev => ({ ...prev, score: result.score, reason: result.reason }));
                      }
                    } catch (err) {
                      console.error('Re-evaluation failed:', err);
                    }
                  }}
                  style={{ marginTop: '15px', padding: '8px 16px', fontSize: '0.85rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  <Sparkles size={14} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
                  理由を取得
                </button>
              )}
            </div>

            <button onClick={() => setSelectedMeal(null)} className="btn-primary" style={{ width: '100%', padding: '12px', fontSize: '1rem' }}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* からだの詳細（実測 + ダイエット目標） */}
      {showBodyDetail && (
        <div style={{ position: 'relative', zIndex: 1001 }}>
            <BodyDetailModal
              user={user}
              userProfile={userProfile}
              weights={weights}
              title={isToday(currentDate) ? '今日のからだ' : 'この日のからだ'}
              activity={activityForDate}
              body={selectedWeightEntry}
              sleep={sleepForDate}
              sleepLabel={isToday(currentDate) ? '昨夜の睡眠' : 'この日の夜の睡眠'}
              workouts={workoutsForDate}
              onClose={() => setShowBodyDetail(false)}
              onUpdateWeights={loadData}
              recentCalories={(() => {
                // Calculate average of last 7 days including today
                let total = 0;
                let count = 0;
                for (let i = 0; i <= 7; i++) {
                  const d = new Date();
                  d.setDate(d.getDate() - i);
                  const t = getDailyTotals(d);
                  if (meals.some(m => isSameDay(new Date(m.timestamp), d))) {
                    total += t.calories;
                    count++;
                  }
                }
                return count > 0 ? Math.round(total / count) : null;
              })()}
              streakDays={(() => {
                // Simple streak calculation
                let streak = 0;
                for (let i = 0; i < 30; i++) {
                  const d = new Date();
                  d.setDate(d.getDate() - i);
                  if (meals.some(m => isSameDay(new Date(m.timestamp), d))) {
                    streak++;
                  } else {
                    break;
                  }
                }
                return streak;
              })()}
            />
        </div>
      )}

      {showEvaluation && (
        <div style={{ position: 'relative', zIndex: 1001 }}>
          <EvaluationModal
            data={evaluationData}
            savedResult={evaluationsCache[currentDateKey]} // 日付ベースのキャッシュを渡す
            onSave={async (result) => {
              // メモリキャッシュを更新
              setEvaluationsCache(prev => ({ ...prev, [currentDateKey]: result }));
              // Firestoreに保存
              if (user) {
                await saveDailyEvaluation(user.uid, currentDateKey, result);
              }
            }}
            onClose={() => setShowEvaluation(false)}
            onEvaluationComplete={handleEvaluationComplete}
            stockItems={stockItems}
            isToday={isToday(currentDate)} // 今日かどうかのフラグ
            dateLabel={`${currentDate.getMonth() + 1}/${currentDate.getDate()}`} // 日付ラベル
            userId={user?.uid}
            userProfile={userProfile}
          />
        </div>
      )}

      {showAdvisor && (
        <div style={{ position: 'relative', zIndex: 1000 }}>
          <AdvisorModal
            targetType="auto"
            history={displayMeals}
            dailyLog={{
              totalCalories,
              targetCalories,
              macros: {
                protein: displayMeals.reduce((acc, m) => acc + (m.macros?.protein || 0), 0),
                fat: displayMeals.reduce((acc, m) => acc + (m.macros?.fat || 0), 0),
                carbs: displayMeals.reduce((acc, m) => acc + (m.macros?.carbs || 0), 0)
              }
            }}
            savedState={advisorState}
            onSave={setAdvisorState}
            onClose={() => setShowAdvisor(false)}
            onSuggestionClick={(query) => {
              setShowAdvisor(false);
              setInitialRecipeSearch(query);
              setShowLogger(true);
            }}
            stockItems={stockItems}
            userId={user?.uid} // Pass User ID
            profile={userProfile} // Pass Profile
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
              savedRecipeSearch={recipeSearchState}
              onSaveRecipeSearch={setRecipeSearchState}
              recentMeals={recentMealsForLogger}
            />
          </div>
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
      {showConditionModal && (
        <ConditionModal
          isOpen={showConditionModal}
          result={conditionResult}
          onClose={() => setShowConditionModal(false)}
          onRequestAnalysis={handleRequestConditionAnalysis}
          historyLogs={conditionLogs}
        />
      )}

      {showGame && (
        <DietShooter meals={meals} user={user} userProfile={userProfile} onClose={() => setShowGame(false)} />
      )}

      {/* Elena's Challenge Quiz */}
      <ElenaChallengeModal isOpen={showQuiz} onClose={() => setShowQuiz(false)} />

    </main >
  );
}
