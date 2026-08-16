// レシピのカテゴリ定義（唯一の真実）。
// Web の FoodLogger と LINE のレシピカルーセルの両方がここを参照する。
// 保存形式は id 文字列（users/{uid}/recipes/{id}.category）。
// カテゴリ未設定の既存レシピは null のままにする（「未分類」として扱う）。

export const RECIPE_CATEGORIES = [
    { id: 'main', label: '主菜', icon: '🍗' },
    { id: 'side', label: '副菜', icon: '🥗' },
    { id: 'staple', label: '主食', icon: '🍚' },
    { id: 'soup', label: '汁物', icon: '🍲' },
    { id: 'dessert', label: 'デザート・間食', icon: '🍰' },
    { id: 'other', label: 'その他', icon: '🍽️' },
];

export const UNCATEGORIZED_LABEL = '未分類';

export const isRecipeCategory = (value) =>
    RECIPE_CATEGORIES.some(category => category.id === value);

/** 保存用に正規化する。未知の値・空文字は null（未分類）に落とす */
export const normalizeRecipeCategory = (value) =>
    (isRecipeCategory(value) ? value : null);

export const getRecipeCategoryLabel = (id) => {
    const category = RECIPE_CATEGORIES.find(c => c.id === id);
    return category ? category.label : UNCATEGORIZED_LABEL;
};

export const getRecipeCategoryIcon = (id) => {
    const category = RECIPE_CATEGORIES.find(c => c.id === id);
    return category ? category.icon : '📄';
};

/**
 * レシピ一覧をカテゴリ順にグループ化する。
 * RECIPE_CATEGORIES の並び順を保ち、未分類は最後に置く。
 * レシピが1件もないカテゴリは返さない（空の見出しを出さないため）。
 */
export const groupRecipesByCategory = (recipes = []) => {
    const groups = [
        ...RECIPE_CATEGORIES.map(category => ({
            id: category.id,
            label: category.label,
            icon: category.icon,
            recipes: [],
        })),
        { id: null, label: UNCATEGORIZED_LABEL, icon: '📄', recipes: [] },
    ];

    for (const recipe of recipes) {
        const categoryId = normalizeRecipeCategory(recipe?.category);
        const group = groups.find(g => g.id === categoryId) || groups.at(-1);
        group.recipes.push(recipe);
    }

    return groups.filter(group => group.recipes.length > 0);
};
