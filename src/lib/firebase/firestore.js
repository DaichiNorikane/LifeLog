import { db } from "./config";
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    updateDoc,
    writeBatch,
    Timestamp
} from "firebase/firestore";
import { cleanData } from "@/utils/cleanData";
import { normalizeMacros } from "@/lib/health/nutrients";

// Get User Profile
export const getUserProfile = async (userId) => {
    try {
        const docRef = doc(db, "users", userId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            return null;
        }
    } catch (e) {
        console.error("Error fetching profile:", e);
        return null;
    }
};

// Collection reference
const getMealsConf = (userId) => collection(db, "users", userId, "meals");

// Add a meal
export const addMealToFirestore = async (userId, meal) => {
    try {
        const mealsRef = getMealsConf(userId);

        // Prepare clean payload
        const payload = cleanData({
            ...meal,
            timestamp: meal.timestamp || new Date().toISOString(),
            createdAt: Timestamp.now(),
            // Ensure image is null if missing/empty to be explicit, or keep as is.
            // Firestore likes consistent types.
            image: meal.image || null
        });

        const docRef = await addDoc(mealsRef, payload);
        return docRef.id;
    } catch (e) {
        console.error("Error adding document: ", e);
        throw e; // Propagate error so page.js knows
    }
};

// Get meals (limited to recent days for performance)
export const getMealsFromFirestore = async (userId, daysBack = 45) => {
    try {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - daysBack);
        const q = query(
            getMealsConf(userId),
            where("timestamp", ">=", sinceDate.toISOString()),
            orderBy("timestamp", "desc"),
            limit(500)
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (e) {
        console.error("Error getting documents: ", e);
        return [];
    }
};

// Delete a meal
export const deleteMealFromFirestore = async (userId, mealId) => {
    try {
        const mealDoc = doc(db, "users", userId, "meals", mealId);
        await deleteDoc(mealDoc);
    } catch (e) {
        console.error("Error deleting document: ", e);
    }
};


// Update a meal
export const updateMealInFirestore = async (userId, mealId, updates) => {
    try {
        const mealDoc = doc(db, "users", userId, "meals", mealId);
        const cleanUpdates = cleanData({ ...updates, updatedAt: Timestamp.now() });
        await setDoc(mealDoc, cleanUpdates, { merge: true });
    } catch (e) {
        console.error("Error updating meal: ", e);
        throw e;
    }
};

// Save User Profile
export const saveUserProfile = async (userId, profile) => {
    try {
        await setDoc(doc(db, "users", userId), profile, { merge: true });
    } catch (e) {
        console.error("Error saving profile: ", e);
    }
}

// Weight Management
const getWeightsRef = (userId) => collection(db, "users", userId, "weights");

export const addWeightToFirestore = async (userId, weight, date) => {
    try {
        // Use Local Date string YYYY-MM-DD as ID to match UI
        const d = new Date(date);
        const offset = d.getTimezoneOffset() * 60000;
        const localDate = new Date(d.getTime() - offset);
        const dateId = localDate.toISOString().split('T')[0];

        const weightDoc = doc(db, "users", userId, "weights", dateId);

        await setDoc(weightDoc, {
            weight: parseFloat(weight),
            date: dateId, // search key
            timestamp: date.toISOString(), // exact time
            updatedAt: Timestamp.now()
        }, { merge: true });
    } catch (e) {
        console.error("Error adding weight: ", e);
        throw e;
    }
};

export const getWeightsFromFirestore = async (userId) => {
    try {
        const q = query(getWeightsRef(userId), orderBy("date", "desc"), limit(120));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (e) {
        console.error("Error fetching weights:", e);
        return [];
    }
};

// --- History & Recipes ---

// Get Recent Unique Meals (limit 50 unique)
export const getRecentMeals = async (userId, limitCount = 50) => {
    try {
        // Fetch more to ensure we get enough unique items after deduping
        const q = query(getMealsConf(userId), orderBy("timestamp", "desc"), limit(100));
        const snapshot = await getDocs(q);

        const uniqueMeals = [];
        const seenNames = new Set();

        for (const doc of snapshot.docs) {
            const data = doc.data();
            // Normalize name to avoid "Ramen" vs "ramen" duplicates if needed. 
            // For now, exact match.
            if (data.foodName && !seenNames.has(data.foodName)) {
                seenNames.add(data.foodName);
                uniqueMeals.push({ id: doc.id, ...data });
            }
            if (uniqueMeals.length >= limitCount) break;
        }

        return uniqueMeals;
    } catch (e) {
        console.error("Error fetching recent meals:", e);
        return [];
    }
};


// --- STOCK/PANTRY ---

export const addStockItem = async (userId, item) => {
    try {
        const userRef = doc(db, 'users', userId);
        const stockRef = collection(userRef, 'stockItems');
        await addDoc(stockRef, {
            ...item,
            addedAt: new Date().toISOString()
        });
    } catch (e) {
        console.error("Error adding stock item: ", e);
        throw e;
    }
};

export const getStockItems = async (userId) => {
    try {
        const userRef = doc(db, 'users', userId);
        const stockRef = collection(userRef, 'stockItems');
        const q = query(stockRef, orderBy('addedAt', 'desc'), limit(200));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error getting stock items: ", e);
        return [];
    }
};

export const deleteStockItem = async (userId, itemId) => {
    try {
        const itemRef = doc(db, 'users', userId, 'stockItems', itemId);
        await deleteDoc(itemRef);
    } catch (e) {
        console.error("Error deleting stock item: ", e);
        throw e;
    }
};

// Recipe Management
const getRecipesRef = (userId) => collection(db, "users", userId, "recipes");

export const addRecipeToFirestore = async (userId, recipe) => {
    try {
        const recipesRef = getRecipesRef(userId);
        const payload = cleanData({
            ...recipe,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });
        await addDoc(recipesRef, payload);
    } catch (e) {
        console.error("Error adding recipe:", e);
        throw e;
    }
};

export const getRecipesFromFirestore = async (userId) => {
    try {
        const q = query(getRecipesRef(userId), orderBy("createdAt", "desc"), limit(200));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (e) {
        console.error("Error fetching recipes:", e);
        return [];
    }
};

// カテゴリの付け替えなど、レシピの一部だけを更新する
export const updateRecipeInFirestore = async (userId, recipeId, patch) => {
    try {
        const recipeDoc = doc(db, "users", userId, "recipes", recipeId);
        await updateDoc(recipeDoc, { ...patch, updatedAt: Timestamp.now() });
    } catch (e) {
        console.error("Error updating recipe:", e);
        throw e;
    }
};

export const deleteRecipeFromFirestore = async (userId, recipeId) => {
    try {
        const recipeDoc = doc(db, "users", userId, "recipes", recipeId);
        await deleteDoc(recipeDoc);
    } catch (e) {
        console.error("Error deleting recipe:", e);
    }
};

// --- Game Scores ---
export const saveGameScore = async (userId, userName, score, dietStats) => {
    if (!userId) return;
    try {
        await addDoc(collection(db, "game_scores"), {
            userId,
            userName: userName || 'Anonymous',
            score: Number(score),
            stats: dietStats || {},
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error("Error saving score:", e);
    }
};

export const getLeaderboard = async () => {
    try {
        const q = query(
            collection(db, "game_scores"),
            orderBy("score", "desc"),
            limit(10)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error fetching leaderboard:", e);
        return [];
    }
};

export const resetLeaderboard = async () => {
    try {
        const q = query(collection(db, "game_scores"));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    } catch (e) {
        console.error("Error resetting leaderboard:", e);
    }
};

// ========== Daily Evaluation (日付ごとの評価) ==========

// Save daily evaluation for a specific date
export const saveDailyEvaluation = async (userId, dateKey, evaluation) => {
    try {
        const docRef = doc(db, "users", userId, "dailyEvaluations", dateKey);
        const payload = cleanData({
            ...evaluation,
            dateKey,
            savedAt: Timestamp.now()
        });
        await setDoc(docRef, payload);
        console.log(`[Firestore] Saved evaluation for ${dateKey}`);
    } catch (e) {
        console.error("Error saving daily evaluation:", e);
        throw e;
    }
};

// Get daily evaluation for a specific date
export const getDailyEvaluation = async (userId, dateKey) => {
    try {
        const docRef = doc(db, "users", userId, "dailyEvaluations", dateKey);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (e) {
        console.error("Error fetching daily evaluation:", e);
        return null;
    }
};

// ========== Elena's Challenge (Quiz) ==========

// Save a new quiz to stock
// Save a new quiz to stock
export const saveQuizToStock = async (userId, quizData) => {
    try {
        const quizzesRef = collection(db, "users", userId, "quizzes");

        // Check for duplicates (simple check by question text)
        // Note: This might be expensive if many quizzes, but stock is capped at ~50.
        // A better way would be to query by a specific field if indexed, but for <50 items, 
        // client-side filtering or exact match query is okay.
        // Let's use exact match query.
        const q = query(quizzesRef, where("question", "==", quizData.question));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            console.log(`[Quiz] Duplicate question found, skipping: ${quizData.question}`);
            return;
        }

        const payload = cleanData({
            ...quizData,
            correctCount: 0,
            incorrectCount: 0,
            createdAt: Timestamp.now(),
            lastShown: null
        });
        await addDoc(quizzesRef, payload);
    } catch (e) {
        console.error("Error saving quiz:", e);
    }
};

// Update quiz result (increment counts)
export const updateQuizResult = async (userId, quizId, isCorrect) => {
    try {
        const quizRef = doc(db, "users", userId, "quizzes", quizId);
        const quizSnap = await getDoc(quizRef);

        if (!quizSnap.exists()) return;
        const data = quizSnap.data();

        if (isCorrect) {
            const newCorrectCount = (data.correctCount || 0) + 1;
            // If mastered (5 correct), delete
            if (newCorrectCount >= 5) {
                await deleteDoc(quizRef);
                console.log(`[Quiz] Quiz ${quizId} mastered and deleted.`);
            } else {
                await updateDoc(quizRef, {
                    correctCount: newCorrectCount,
                    lastShown: Timestamp.now()
                });
            }
        } else {
            await updateDoc(quizRef, {
                incorrectCount: (data.incorrectCount || 0) + 1,
                lastShown: Timestamp.now()
            });
        }
    } catch (e) {
        console.error("Error updating quiz result:", e);
    }
};

// Get a quiz from stock using weighted random selection (Prioritize Unseen)
export const getQuizFromStock = async (userId) => {
    try {
        const quizzesRef = collection(db, "users", userId, "quizzes");
        const snapshot = await getDocs(quizzesRef);

        if (snapshot.empty) return null;

        const quizzes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 1. Filter out mastered
        const candidates = quizzes.filter(q => (q.correctCount || 0) < 5);
        if (candidates.length === 0) return null;

        // 2. Prioritize "Never Shown" (lastShown == null)
        const neverShown = candidates.filter(q => !q.lastShown);
        if (neverShown.length > 0) {
            // Pick purely random from never shown to ensure variety on startup
            const randomIndex = Math.floor(Math.random() * neverShown.length);
            console.log(`[Quiz] Picking from ${neverShown.length} unseen quizzes.`);
            return neverShown[randomIndex];
        }

        // 3. If all seen, pick from "Least Recently Shown" (Oldest 60%) to avoid immediate repeats
        const sortedByTime = candidates.sort((a, b) => {
            const timeA = a.lastShown?.toMillis() || 0;
            const timeB = b.lastShown?.toMillis() || 0;
            return timeA - timeB; // Oldest first
        });

        // Take top 60% oldest
        const candidatePoolSize = Math.max(1, Math.ceil(sortedByTime.length * 0.6));
        const pool = sortedByTime.slice(0, candidatePoolSize);

        // 4. Weighted Random on the pool (incorrect answers increase weight)
        const weightedCandidates = pool.map(q => {
            let weight = 10;
            weight += (q.incorrectCount || 0) * 20;
            weight -= (q.correctCount || 0) * 2;
            if (weight < 1) weight = 1;
            return { quiz: q, weight };
        });

        const totalWeight = weightedCandidates.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;

        for (const item of weightedCandidates) {
            random -= item.weight;
            if (random <= 0) {
                console.log(`[Quiz] Picking weighted quiz (Last shown: ${item.quiz.lastShown?.toDate()})`);
                return item.quiz;
            }
        }
        return weightedCandidates[weightedCandidates.length - 1].quiz;

    } catch (e) {
        console.error("Error fetching quiz:", e);
        return null;
    }
};

// Check if stock is low
export const getQuizStockCount = async (userId) => {
    try {
        const quizzesRef = collection(db, "users", userId, "quizzes");
        const snapshot = await getDocs(quizzesRef); // expensive if large, but max 50 is fine
        return snapshot.size;
    } catch (e) {
        console.error("Error counting quizzes:", e);
        return 0;
    }
};

// ========== LINE Linking ==========

// Save a temporary 6-digit link code
export const saveLinkCode = async (userId, code) => {
    try {
        await addDoc(collection(db, "linkCodes"), {
            userId,
            code, // 6 digit string
            createdAt: Timestamp.now(),
        });
    } catch (e) {
        console.error("Error saving link code:", e);
        throw e;
    }
};
// ========== Condition Logs (体感ログ) ==========
// users/{uid}/conditionLogs/{YYYY-MM-DD}
// 日付キーは「論理日」(4:00区切り)。ルールは src/lib/health/conditionDate.js を参照。

const getConditionLogRef = (userId, dateKey) =>
    doc(db, "users", userId, "conditionLogs", dateKey);

/** 体感ログを部分更新（マージ）。既存フィールドは壊さない */
export const saveConditionLog = async (userId, dateKey, patch) => {
    if (!userId || !dateKey) return;
    try {
        const payload = cleanData({
            ...patch,
            date: dateKey,
            updatedAt: Timestamp.now(),
        });
        await setDoc(getConditionLogRef(userId, dateKey), payload, { merge: true });
    } catch (e) {
        console.error("Error saving condition log:", e);
        throw e;
    }
};

/**
 * 体感の1タップ入力を保存する。
 * @param {'sleep'|'focus'|'energy'|'mood'} axis
 * @param {number|null} value 1-5 の主観スコア
 */
export const saveConditionCheckIn = async (userId, dateKey, axis, value) => {
    const numeric = value === null || value === undefined ? null : Number(value);
    if (numeric !== null && (!Number.isFinite(numeric) || numeric < 1 || numeric > 5)) {
        throw new Error(`Invalid condition value for ${axis}: ${value}`);
    }
    const entry = {
        subjective: numeric,
        recordedAt: new Date().toISOString(),
    };
    // 睡眠は HealthKit 由来の客観値とマージされるため source を明示する
    if (axis === 'sleep') entry.source = 'manual';

    await saveConditionLog(userId, dateKey, { [axis]: entry });
};

/**
 * その日の予測をスナップショット保存（ルール改訂後も過去の分析が壊れないように）。
 * 発火したドライバーも一緒に残す。これが無いと「どの要因が効いた日か」が分からず
 * 相関分析ができない。
 */
export const saveConditionPrediction = async (userId, dateKey, predicted, engineVersion, firedDrivers = null) => {
    const patch = { predicted, engineVersion };
    if (firedDrivers) patch.firedDrivers = firedDrivers;
    await saveConditionLog(userId, dateKey, patch);
};

// ========== Condition Model（学習した個人係数）==========
// users/{uid}/insights/conditionModel

const getConditionModelRef = (userId) =>
    doc(db, "users", userId, "insights", "conditionModel");

export const saveConditionModel = async (userId, model) => {
    if (!userId || !model) return;
    try {
        await setDoc(getConditionModelRef(userId), cleanData({
            ...model,
            updatedAt: Timestamp.now(),
        }));
    } catch (e) {
        console.error("Error saving condition model:", e);
        throw e;
    }
};

export const getConditionModel = async (userId) => {
    if (!userId) return null;
    try {
        const snap = await getDoc(getConditionModelRef(userId));
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        console.error("Error fetching condition model:", e);
        return null;
    }
};

export const getConditionLog = async (userId, dateKey) => {
    if (!userId || !dateKey) return null;
    try {
        const snap = await getDoc(getConditionLogRef(userId, dateKey));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (e) {
        console.error("Error fetching condition log:", e);
        return null;
    }
};

/** 相関分析用にまとめて取得（新しい順） */
export const getConditionLogs = async (userId, limitCount = 60) => {
    if (!userId) return [];
    try {
        const q = query(
            collection(db, "users", userId, "conditionLogs"),
            orderBy("date", "desc"),
            limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("Error fetching condition logs:", e);
        return [];
    }
};

// ========== Drink Presets (マイドリンク) ==========
// 「コーヒー」からカフェイン量をAIに当てさせるのは精度が出ないため、
// よく飲むものを固定値のプリセットとして持つ。睡眠判定の主要ドライバーなので精度を優先する。

const getDrinkPresetsRef = (userId) => collection(db, "users", userId, "drinkPresets");

export const addDrinkPreset = async (userId, preset) => {
    if (!userId || !preset?.name) return null;
    try {
        const payload = cleanData({
            name: preset.name,
            calories: Number(preset.calories) || 0,
            macros: normalizeMacros(preset.macros),
            createdAt: Timestamp.now(),
        });
        const docRef = await addDoc(getDrinkPresetsRef(userId), payload);
        return docRef.id;
    } catch (e) {
        console.error("Error adding drink preset:", e);
        throw e;
    }
};

export const getDrinkPresets = async (userId) => {
    if (!userId) return [];
    try {
        const q = query(getDrinkPresetsRef(userId), orderBy("createdAt", "desc"), limit(50));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("Error fetching drink presets:", e);
        return [];
    }
};

export const deleteDrinkPreset = async (userId, presetId) => {
    if (!userId || !presetId) return;
    try {
        await deleteDoc(doc(db, "users", userId, "drinkPresets", presetId));
    } catch (e) {
        console.error("Error deleting drink preset:", e);
        throw e;
    }
};

// ========== Search History ==========

export const addSearchHistory = async (userId, item) => {
    if (!userId || !item || !item.foodName) return;
    try {
        const historyRef = collection(db, "users", userId, "searchHistory");

        // Check for duplicate foodName to update timestamp instead of adding new
        const q = query(historyRef, where("foodName", "==", item.foodName), limit(1));
        const snapshot = await getDocs(q);

        // 拡張栄養素: nullは明示的に保存（0と未取得を区別するため）
        const macrosPayload = cleanData({
            ...(item.macros || {}),
            ...normalizeMacros(item.macros),
        });

        const payload = cleanData({
            foodName: item.foodName,
            calories: item.calories,
            macros: macrosPayload,
            reasoning: item.reasoning || "",
            timestamp: Timestamp.now(),
            searchedAt: new Date().toISOString()
        });

        if (!snapshot.empty) {
            const docId = snapshot.docs[0].id;
            const docRef = doc(db, "users", userId, "searchHistory", docId);
            await updateDoc(docRef, {
                timestamp: Timestamp.now(),
                searchedAt: new Date().toISOString(),
                calories: item.calories,
                macros: macrosPayload
            });
        } else {
            await addDoc(historyRef, payload);
        }
    } catch (e) {
        console.error("Error adding search history:", e);
    }
};

export const getSearchHistory = async (userId, limitCount = 20) => {
    if (!userId) return [];
    try {
        const historyRef = collection(db, "users", userId, "searchHistory");
        const q = query(historyRef, orderBy("timestamp", "desc"), limit(limitCount));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error fetching search history:", e);
        return [];
    }
};

// ========== Activity Logs（HealthKit 由来の日次アクティビティ）==========
// users/{uid}/activityLogs/{YYYY-MM-DD}
// 日付キーはカレンダー日。HealthKit の日次集計（0:00 区切り）に揃えるため、
// コンディションの論理日（4:00 区切り）とは意図的にずらしてある。

export const getActivityLogs = async (userId, limitCount = 30) => {
    if (!userId) return [];
    try {
        const q = query(
            collection(db, "users", userId, "activityLogs"),
            orderBy("date", "desc"),
            limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("Error fetching activity logs:", e);
        return [];
    }
};

// ========== Workouts（HealthKit 由来の個別ワークアウト）==========
// users/{uid}/workouts/{workoutId}（ID は開始時刻＋種目の冪等キー）

export const getRecentWorkouts = async (userId, limitCount = 30) => {
    if (!userId) return [];
    try {
        const q = query(
            collection(db, "users", userId, "workouts"),
            orderBy("start", "desc"),
            limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("Error fetching workouts:", e);
        return [];
    }
};
