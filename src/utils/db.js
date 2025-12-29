import { openDB } from 'idb';

const DB_NAME = 'lifelog-db';
const STORE_NAME = 'meals';

export const initDB = async () => {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        },
    });
};

export const addMeal = async (meal) => {
    const db = await initDB();
    return db.add(STORE_NAME, meal);
};

export const getAllMeals = async () => {
    const db = await initDB();
    return db.getAll(STORE_NAME);
};

export const deleteMealById = async (id) => {
    const db = await initDB();
    return db.delete(STORE_NAME, id);
};

export const deleteAllMeals = async () => {
    const db = await initDB();
    return db.clear(STORE_NAME);
}
