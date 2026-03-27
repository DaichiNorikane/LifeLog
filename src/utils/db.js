import { openDB } from 'idb';

const DB_NAME = 'lifelog-db';
const DB_VERSION = 2;

let dbPromise;

export const initDB = async () => {
    if (dbPromise) return dbPromise;
    dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            // v1: meals store
            if (!db.objectStoreNames.contains('meals')) {
                db.createObjectStore('meals', { keyPath: 'id' });
            }
            // v2: cache store for all data types
            if (oldVersion < 2) {
                if (!db.objectStoreNames.contains('cache')) {
                    db.createObjectStore('cache', { keyPath: 'key' });
                }
            }
        },
    });
    return dbPromise;
};

// --- Generic Cache (for meals, weights, stock, profile, recipes, evaluations) ---

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached data by key. Returns null if expired or missing.
 */
export const getCache = async (key) => {
    try {
        const db = await initDB();
        const entry = await db.get('cache', key);
        if (!entry) return null;
        // Check TTL
        if (Date.now() - entry.updatedAt > CACHE_TTL) {
            return { data: entry.data, stale: true };
        }
        return { data: entry.data, stale: false };
    } catch (e) {
        console.warn('[Cache] read error:', e);
        return null;
    }
};

/**
 * Set cached data by key.
 */
export const setCache = async (key, data) => {
    try {
        const db = await initDB();
        await db.put('cache', { key, data, updatedAt: Date.now() });
    } catch (e) {
        console.warn('[Cache] write error:', e);
    }
};

/**
 * Delete a cache entry.
 */
export const deleteCache = async (key) => {
    try {
        const db = await initDB();
        await db.delete('cache', key);
    } catch (e) {
        console.warn('[Cache] delete error:', e);
    }
};

/**
 * Invalidate all caches for a user (e.g., on logout).
 */
export const clearAllCache = async () => {
    try {
        const db = await initDB();
        await db.clear('cache');
    } catch (e) {
        console.warn('[Cache] clear error:', e);
    }
};

// --- Legacy exports (kept for compatibility) ---

export const addMeal = async (meal) => {
    const db = await initDB();
    return db.add('meals', meal);
};

export const getAllMeals = async () => {
    const db = await initDB();
    return db.getAll('meals');
};

export const deleteMealById = async (id) => {
    const db = await initDB();
    return db.delete('meals', id);
};

export const deleteAllMeals = async () => {
    const db = await initDB();
    return db.clear('meals');
};
