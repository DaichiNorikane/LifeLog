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
    getDoc
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
    const cleaned = { ...data };
    Object.keys(cleaned).forEach(key => {
        if (cleaned[key] === undefined) {
            delete cleaned[key];
        }
        // Convert strict nulls to empty string if needed, or keep null.
        // Convert NaN to 0
        if (typeof cleaned[key] === 'number' && isNaN(cleaned[key])) {
            cleaned[key] = 0;
        }
        // Recurse for macros
        if (typeof cleaned[key] === 'object' && cleaned[key] !== null && !(cleaned[key] instanceof Date)) {
            cleaned[key] = cleanData(cleaned[key]);
        }
    });
    return cleaned;
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
