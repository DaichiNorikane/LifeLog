import { db } from "./config";
import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    query,
    orderBy,
    Timestamp,
    setDoc,
    getDoc,
    limit
} from "firebase/firestore";


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

// Helper to clean object for Firestore
const cleanData = (data) => {
    if (data === null || data === undefined) return null;
    if (Array.isArray(data)) {
        return data.map(item => cleanData(item)).filter(item => item !== undefined);
    }
    if (typeof data === 'object' && !(data instanceof Date)) {
        const cleaned = {};
        Object.keys(data).forEach(key => {
            const value = cleanData(data[key]);
            if (value !== undefined) {
                cleaned[key] = value;
            }
        });
        return cleaned;
    }
    // Primitives
    if (typeof data === 'number' && isNaN(data)) return 0;
    return data;
};

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

        await addDoc(mealsRef, payload);
    } catch (e) {
        console.error("Error adding document: ", e);
        throw e; // Propagate error so page.js knows
    }
};

// Get all meals
export const getMealsFromFirestore = async (userId) => {
    try {
        const q = query(getMealsConf(userId), orderBy("timestamp", "desc"));
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
        // Use date string YYYY-MM-DD as ID to enforce one entry per day
        const dateId = date.toISOString().split('T')[0];
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
        const q = query(getWeightsRef(userId), orderBy("date", "desc")); // Order by date string
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
        const q = query(getRecipesRef(userId), orderBy("createdAt", "desc"));
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

export const deleteRecipeFromFirestore = async (userId, recipeId) => {
    try {
        const recipeDoc = doc(db, "users", userId, "recipes", recipeId);
        await deleteDoc(recipeDoc);
    } catch (e) {
        console.error("Error deleting recipe:", e);
    }
};
