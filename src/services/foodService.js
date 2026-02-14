import mextData from '../data/mext_fct_2020.json';

// Simple normalization map for common user queries vs official DB terms (which often use Hiragana/Katakana or specific phrasing)
const QUERY_NORMALIZATION_MAP = {
    "牛": "うし",
    "豚": "ぶた",
    "鶏": "にわとり",
    "鳥": "にわとり",
    "米": "こめ",
    "ご飯": "こめ",
    "ごはん": "こめ",
    "卵": "たまご",
    "玉子": "たまご",
    "パン": "ぱん", // Sometimes "パン" is there, but "食パン" -> "パン 食パン" etc.
};

/**
 * Search the Standard Tables of Food Composition in Japan (2020).
 * @param {string} query - The search query.
 * @returns {Array} - Array of matching food items.
 */
export const searchOfficialFoodDatabase = (query) => {
    if (!query || query.length < 1) return [];

    // Normalize Query
    let processedQuery = query.trim();

    // Replace known keys with official terms for better hits
    // We do a simple replacement. For more complex logic, we might need multiple passes or expansion.
    Object.keys(QUERY_NORMALIZATION_MAP).forEach(key => {
        if (processedQuery.includes(key)) {
            // Check if it's part of a longer word that shouldn't be replaced? 
            // For now, simple replacement is likely better than missing "牛" entirely.
            // E.g. "牛丼" -> "うし丼". "うし" search will hit "うし [副品目] ..." maybe?
            // Actually, "牛" -> "うし" works for "Beef". 
            // "吉野家の牛丼" -> "吉野家のうし丼". Official DB probably fails on "吉野家" anyway.
            processedQuery = processedQuery.replace(new RegExp(key, 'g'), QUERY_NORMALIZATION_MAP[key]);
        }
    });

    const keywords = processedQuery.replace(/　/g, ' ').split(' ').filter(k => k);

    // Safety check for data
    if (!Array.isArray(mextData)) {
        console.error("MEXT Data is not an array");
        return [];
    }

    // Filter
    const matches = mextData.filter(item => {
        const name = item.foodName || "";
        return keywords.every(k => name.includes(k));
    });

    // Sort matches: shorter names (more exact) first, then deeper logic if needed
    matches.sort((a, b) => {
        return (a.foodName.length) - (b.foodName.length);
    });

    // Map to application format
    // MEXT Data keys: 
    // enercKcal (kcal), prot (g), fat (g), chocdf (carbohydrate g)
    // Note: 'chocdf' is "Carbohydrate, by difference" which is standard.
    return matches.slice(0, 20).map(item => ({
        foodName: item.foodName,
        calories: Math.round(item.enercKcal || 0),
        macros: {
            protein: item.prot || 0,
            fat: item.fat || 0,
            carbs: item.chocdf || 0
        },
        source: "Standard Tables of Food Composition in Japan 2020",
        originalId: item.foodId
    }));
};
