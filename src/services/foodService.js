// 1. Static Import (easiest for Vercel bundling)
import mextData from '@/data/mext_fct_2020.json';
// Alternatively, if static import fails due to size (unlikely for 2MB), use raw-loader?
// But Next.js handles JSON imports fine.

// Simple normalization map for common user queries vs official DB terms
const QUERY_NORMALIZATION_MAP = {
    "牛": "うし",
    "豚": "ぶた",
    "鶏": "にわとり",
    // "鳥": "にわとり",
    "米": "こめ",
    "ご飯": "こめ",
    "ごはん": "こめ",
    "卵": "たまご",
    "玉子": "たまご",
};

// Helper to load data - effectively just returns the imported data
const loadMextData = () => {
    // If it's already an object (default export from JSON)
    return mextData;
};

/**
 * Search the Standard Tables of Food Composition in Japan (2020).
 * @param {string} query - The search query.
 * @returns {Object} - { results: [], debug: {} }
 */
export const searchOfficialFoodDatabase = (query) => {
    if (!query || query.length < 1) return { results: [], debug: { error: "empty query" } };

    const data = loadMextData();
    if (!data || data.length === 0) return { results: [], debug: { error: "no data loaded" } };

    // Normalize Query
    let rawQuery = query.trim();
    let normalizedQuery = rawQuery;

    // Apply normalization
    Object.keys(QUERY_NORMALIZATION_MAP).forEach(key => {
        if (normalizedQuery.includes(key)) {
            normalizedQuery = normalizedQuery.replace(new RegExp(key, 'g'), QUERY_NORMALIZATION_MAP[key]);
        }
    });

    // Create search keywords (split by space)
    // We search with BOTH raw query keywords AND normalized keywords to maximize hits.
    // e.g. input "卵" -> raw "卵", norm "たまご". 
    // If DB has "鶏卵", "卵" hits. If DB has "うし", "牛" hits.

    const rawKeywords = rawQuery.replace(/　/g, ' ').split(' ').filter(k => k);
    const normKeywords = normalizedQuery.replace(/　/g, ' ').split(' ').filter(k => k);

    // Filter
    let matches = data.filter(item => {
        const name = (item.foodName || "").toLowerCase();
        // Strict Match: All keywords must be present
        const rawMatch = rawKeywords.every(k => name.includes(k.toLowerCase()));
        const normMatch = normKeywords.every(k => name.includes(k.toLowerCase()));
        return rawMatch || normMatch;
    });

    // Fallback: If no matches, try looser OR match (any keyword)
    if (matches.length === 0 && rawKeywords.length > 0) {
        matches = data.filter(item => {
            const name = (item.foodName || "").toLowerCase();
            return rawKeywords.some(k => name.includes(k.toLowerCase()));
        });
    }

    console.log(`[foodService] Search for "${query}" (norm: "${normalizedQuery}") found ${matches.length} matches`);

    // Sort matches: shorter names (more exact) first
    matches.sort((a, b) => {
        return (a.foodName.length) - (b.foodName.length);
    });

    // Map to application format
    const results = matches.slice(0, 50).map(item => ({
        foodName: item.foodName,
        calories: Math.round(item.enercKcal || 0),
        macros: {
            protein: item.prot || 0,
            fat: item.fat || 0,
            carbs: item.chocdf || 0
        },
        source: "official",
        originalId: item.foodId
    }));

    return {
        results,
        debug: {
            totalDB: data.length,
            matches: matches.length,
            query: query,
            norm: normalizedQuery
        }
    };
};
