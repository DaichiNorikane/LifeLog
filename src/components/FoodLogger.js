"use client";
import { useState, useRef, useEffect } from 'react';
import { Camera, X, Loader2, Search, PenTool, Image as ImageIcon, ChevronRight, Trash2, Clock, BookOpen, Plus, Minus, Save, Sparkles } from 'lucide-react';
import { analyzeImage } from '@/services/aiService';
import { searchFoodWithGemini, calculateRecipeWithGemini, searchRecipesWithGemini } from '@/app/actions';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getRecentMeals, getRecipesFromFirestore, addRecipeToFirestore, deleteRecipeFromFirestore } from '@/lib/firebase/firestore';

export default function FoodLogger({ onLogMeal, onCancel, activeDate, initialRecipeSearch = null }) {
    const [activeTab, setActiveTab] = useState('camera'); // 'camera', 'search', 'manual', 'review', 'history', 'recipes'
    const [loading, setLoading] = useState(false);
    const { user } = useAuth();

    // Data State
    const [historyItems, setHistoryItems] = useState([]);
    const [recipes, setRecipes] = useState([]);
    const [historyContext, setHistoryContext] = useState("");

    // Bulk Logic: Main State
    const [pendingItems, setPendingItems] = useState([]);

    // Camera State
    const [scanStep, setScanStep] = useState(0);
    const fileInputRef = useRef(null);
    const [cameraContext, setCameraContext] = useState(""); // New: Photo Context

    // Search State
    const [searchQueries, setSearchQueries] = useState(['']);
    const [searchResults, setSearchResults] = useState([]);

    // Manual State
    const [manualForm, setManualForm] = useState({ foodName: '', calories: '', protein: '' });

    // Recipe State
    const [isCreatingRecipe, setIsCreatingRecipe] = useState(false);

    // Updated recipeForm to include instructions and description
    const [recipeForm, setRecipeForm] = useState({ foodName: '', calories: '', protein: '', fat: '', carbs: '', ingredients: '', instructions: [], description: '' });
    const [selectedRecipe, setSelectedRecipe] = useState(null);
    const [portionMultiplier, setPortionMultiplier] = useState(1.0);
    const [isCalculatingRecipe, setIsCalculatingRecipe] = useState(false);

    const [deleteConfirmation, setDeleteConfirmation] = useState(null); // New state for delete modal

    // Recipe Search State
    const [recipeSearchMode, setRecipeSearchMode] = useState(false);
    const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
    const [foundRecipes, setFoundRecipes] = useState([]); // Array of recipes
    const [isSearchingRecipe, setIsSearchingRecipe] = useState(false);
    const [viewingRecipe, setViewingRecipe] = useState(null); // For viewing details (found or saved)

    // Initial Load & Auto Search
    useEffect(() => {
        if (initialRecipeSearch) {
            setActiveTab('recipes');
            setRecipeSearchMode(true);
            setRecipeSearchQuery(initialRecipeSearch);
            // Auto trigger search
            handleSearchRecipe(null, initialRecipeSearch);
        }
    }, [initialRecipeSearch]);

    // Initial Load
    useEffect(() => {
        const load = async () => {
            if (user) {
                const [h, r] = await Promise.all([
                    getRecentMeals(user.uid),
                    getRecipesFromFirestore(user.uid)
                ]);
                setHistoryItems(h);
                setRecipes(r);

                // Build context (top 20 distinct names)
                const names = h.slice(0, 20).map(i => i.foodName).join(', ');
                setHistoryContext(names);
            }
        };
        load();
    }, [user]);

    // Format date
    const dateStr = activeDate ?
        `${activeDate.getMonth() + 1}/${activeDate.getDate()} (${['日', '月', '火', '水', '木', '金', '土'][activeDate.getDay()]})`
        : '';

    // --- Handlers ---

    // ... (Resize Image Helper same as before) ...
    const resizeImage = (file, maxWidth = 800) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    if (width > maxWidth) {
                        height = Math.round(height * (maxWidth / width));
                        width = maxWidth;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                };
            };
        });
    };

    // 1. Image Handling
    const handleFileSelect = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setLoading(true);
        const newItems = files.map(file => ({
            id: Date.now() + Math.random(),
            type: 'image',
            status: 'preview', // New status
            file: file,
            preview: null
        }));

        setPendingItems(prev => [...prev, ...newItems]);

        // Generate Previews only
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const item = newItems[i];
            try {
                const resizedImage = await resizeImage(file);
                updateItem(item.id, { preview: resizedImage });
            } catch (error) {
                console.error("Preview failed", error);
            }
        }
        setLoading(false);
        setActiveTab('review'); // Go to review to add context/analyze
    };

    const runAnalysis = async (item) => {
        if (!item.file || item.status === 'analyzing') return;
        updateItem(item.id, { status: 'analyzing' });
        try {
            const result = await analyzeImage(item.file, item.context || cameraContext); // Use item-specific context if avail or fallback
            updateItem(item.id, {
                status: 'done',
                result: { ...result, image: item.preview }
            });
        } catch (e) {
            updateItem(item.id, { status: 'error', result: { foodName: '解析エラー', calories: 0 } });
        }
    };

    const updateItem = (id, updates) => {
        setPendingItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    };

    const removeItem = (id) => {
        setPendingItems(prev => prev.filter(item => item.id !== id));
    };

    // 2. Search Handling
    const handleQueryChange = (index, value) => {
        const newQueries = [...searchQueries];
        newQueries[index] = value;
        setSearchQueries(newQueries);
    };
    const addQueryInput = () => setSearchQueries(prev => [...prev, '']);
    const removeQueryInput = (index) => {
        if (searchQueries.length > 1) setSearchQueries(prev => prev.filter((_, i) => i !== index));
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        const combinedQuery = searchQueries.filter(q => q.trim()).join('と');
        if (!combinedQuery) return;

        setLoading(true);
        try {
            const res = await searchFoodWithGemini(combinedQuery, historyContext);
            if (res.suggestions) {
                setSearchResults(res.suggestions);
            }
        } catch (error) {
            console.error("search failed", error);
        } finally {
            setLoading(false);
        }
    };

    // 3. Manual Handling
    const handleManualSubmit = (e) => {
        e.preventDefault();
        addItemToPending({
            foodName: manualForm.foodName,
            calories: parseInt(manualForm.calories || 0),
            macros: { protein: parseInt(manualForm.protein || 0), fat: 0, carbs: 0 },
            reasoning: "手入力"
        }, 'manual');
        setManualForm({ foodName: '', calories: '', protein: '' });
        setActiveTab('review');
    };

    // Helper to Add Item
    const addItemToPending = (resultData, type = 'manual') => {
        const newItem = {
            id: Date.now() + Math.random(),
            type: type,
            status: 'done',
            result: {
                foodName: resultData.foodName,
                calories: resultData.calories,
                macros: resultData.macros || { protein: 0, fat: 0, carbs: 0 },
                reasoning: resultData.reasoning || "",
                image: null
            }
        };
        setPendingItems(prev => [...prev, newItem]);
    };

    // 4. History Handling
    const handleAddHistoryItem = (item) => {
        addItemToPending({
            foodName: item.foodName,
            calories: item.calories,
            macros: item.macros,
            reasoning: "履歴から追加"
        }, 'history');
        alert(`${item.foodName} を追加しました`);
    };

    // 5. Recipe Handling
    const handleCalculateRecipe = async () => {
        if (!recipeForm.ingredients.trim()) return;
        setIsCalculatingRecipe(true);
        try {
            const result = await calculateRecipeWithGemini(recipeForm.ingredients);
            if (result && !result.error) {
                setRecipeForm(prev => ({
                    ...prev,
                    foodName: result.foodName || prev.foodName,
                    calories: result.calories || prev.calories,
                    protein: result.macros?.protein || prev.protein,
                    fat: result.macros?.fat || prev.fat,
                    carbs: result.macros?.carbs || prev.carbs
                }));
                alert(`計算完了: ${result.calories}kcal`);
            } else {
                console.error("Recipe calc failed:", result);
                alert("計算できませんでした: " + (result?.error || "不明なエラー"));
            }
        } catch (e) {
            console.error(e);
            alert("計算エラー");
        } finally {
            setIsCalculatingRecipe(false);
        }
    };

    const handleCreateRecipe = async (e) => {
        e.preventDefault();
        if (!user) return;
        try {
            await addRecipeToFirestore(user.uid, {
                foodName: recipeForm.foodName,
                calories: parseInt(recipeForm.calories),
                macros: {
                    protein: parseInt(recipeForm.protein || 0),
                    fat: parseInt(recipeForm.fat || 0),
                    carbs: parseInt(recipeForm.carbs || 0)
                },
                ingredients: recipeForm.ingredients,
                instructions: recipeForm.instructions || [],
                description: recipeForm.description || ""
            });
            // Refresh
            const r = await getRecipesFromFirestore(user.uid);
            setRecipes(r);
            setIsCreatingRecipe(false);
            setRecipeForm({ foodName: '', calories: '', protein: '', fat: '', carbs: '', ingredients: '', instructions: [], description: '' });
        } catch (e) { console.error(e); }
    };

    const handleDeleteRecipe = (id, e) => {
        e.stopPropagation();
        setDeleteConfirmation({ id });
    };

    const executeDeleteRecipe = async () => {
        if (!deleteConfirmation || !user) return;
        try {
            await deleteRecipeFromFirestore(user.uid, deleteConfirmation.id);
            const r = await getRecipesFromFirestore(user.uid);
            setRecipes(r);
        } catch (e) {
            console.error(e);
            alert("削除に失敗しました");
        } finally {
            setDeleteConfirmation(null);
        }
    };

    const handleSelectRecipe = (recipe) => {
        setSelectedRecipe(recipe);
        setPortionMultiplier(1.0);
    };

    const confirmRecipeLog = () => {
        if (!selectedRecipe) return;
        const multiplier = parseFloat(portionMultiplier);
        addItemToPending({
            foodName: selectedRecipe.foodName + (multiplier !== 1 ? ` (${multiplier}人前)` : ''),
            calories: Math.round(selectedRecipe.calories * multiplier),
            macros: {
                protein: Math.round((selectedRecipe.macros?.protein || 0) * multiplier),
                fat: Math.round((selectedRecipe.macros?.fat || 0) * multiplier),
                carbs: Math.round((selectedRecipe.macros?.carbs || 0) * multiplier)
            },
            reasoning: `レシピ (${multiplier}x)`
        }, 'recipe');
        setSelectedRecipe(null);
        alert('追加しました');
    };

    const handleSearchRecipe = async (e, overrideQuery = null) => {
        if (e) e.preventDefault();
        const query = overrideQuery || recipeSearchQuery;
        if (!query.trim()) return;

        setIsSearchingRecipe(true);
        setFoundRecipes([]);
        try {
            const result = await searchRecipesWithGemini(query);
            if (result && result.recipes) {
                setFoundRecipes(result.recipes);
            } else if (result && result.foodName) {
                setFoundRecipes([result]);
            } else {
                alert("レシピが見つかりませんでした");
            }
        } catch (e) {
            console.error(e);
            alert("検索エラー: " + e.message);
        } finally {
            setIsSearchingRecipe(false);
        }
    };

    const importRecipe = (recipe) => {
        setRecipeForm({
            foodName: recipe.foodName,
            calories: recipe.calories,
            protein: recipe.macros?.protein || 0,
            fat: recipe.macros?.fat || 0,
            carbs: recipe.macros?.carbs || 0,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions || [],
            description: recipe.description || ""
        });
        setRecipeSearchMode(false);
        setFoundRecipes([]);
        setViewingRecipe(null);
        setIsCreatingRecipe(true);
    };

    // Final Log
    const logAllItems = async () => {
        const validItems = pendingItems.filter(i => i.status === 'done' && i.result);
        if (validItems.length === 0) return;
        const mealsToLog = validItems.map(item => ({
            ...item.result,
            timestamp: new Date().toISOString()
        }));
        await onLogMeal(mealsToLog);
    };

    // --- RENDER ---

    // Review Tab
    if (activeTab === 'review') {
        const totalCals = pendingItems.reduce((acc, item) => acc + (item.result?.calories || 0), 0);
        return (
            <div className="fixed-overlay" style={{ ...overlayStyle }}>
                <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '400px', padding: '20px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                    {/* Same Review UI as before */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
                        <h3 className="title-gradient" style={{ margin: 0 }}>記録の確認 ({pendingItems.length})</h3>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setActiveTab('camera')} style={{ background: 'var(--bg-main)', border: 'none', color: 'var(--primary)', padding: '5px 10px', borderRadius: '15px', fontSize: '0.8rem' }}>+ 追加</button>
                            <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)' }}><X size={20} /></button>
                        </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
                        {pendingItems.map((item) => (
                            <div key={item.id} className="glass-panel" style={{ padding: '10px', marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
                                {/* Image/Icon */}
                                {item.result?.image ?
                                    <img src={item.result.image} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} /> :
                                    (item.preview ?
                                        <img src={item.preview} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} /> :
                                        <div style={{ width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', borderRadius: '8px', color: 'var(--primary)' }}>
                                            <PenTool size={20} />
                                        </div>
                                    )
                                }
                                {/* Edit Fields or Analyze Button */}
                                <div style={{ flex: 1 }}>
                                    {item.status === 'preview' || item.status === 'analyzing' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>解析待ち...</div>
                                            <input
                                                placeholder="補足 (例: 半分残した)"
                                                value={item.context || ""}
                                                onChange={(e) => updateItem(item.id, { context: e.target.value })}
                                                style={{ fontSize: '0.8rem', padding: '4px', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}
                                            />
                                            {item.status === 'analyzing' ?
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--primary)' }}><Loader2 size={12} className="spin" /> 解析中...</div> :
                                                <button onClick={() => runAnalysis(item)} style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '0.8rem', alignSelf: 'flex-start' }}>AI解析開始</button>
                                            }
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                value={item.result?.foodName}
                                                onChange={(e) => updateItem(item.id, { result: { ...item.result, foodName: e.target.value } })}
                                                style={{ border: 'none', background: 'transparent', fontWeight: 'bold', width: '100%', outline: 'none', fontSize: '0.95rem' }}
                                            />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                <input
                                                    type="number"
                                                    value={item.result?.calories}
                                                    onChange={(e) => updateItem(item.id, { result: { ...item.result, calories: parseInt(e.target.value) || 0 } })}
                                                    style={{ width: '60px', border: 'none', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', padding: '2px 5px', textAlign: 'right' }}
                                                /> kcal
                                            </div>
                                        </>
                                    )}
                                </div>
                                <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><Trash2 size={16} /></button>
                            </div>
                        ))}
                    </div>
                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontWeight: 'bold' }}>
                            <span>合計</span><span>{totalCals} kcal</span>
                        </div>
                        <button className="btn-primary" style={{ width: '100%' }} onClick={logAllItems} disabled={pendingItems.length === 0 || loading}>すべて記録する</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed-overlay" style={{ ...overlayStyle }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '20px', minHeight: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <button onClick={onCancel} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', zIndex: 10, cursor: 'pointer' }}>
                    <X />
                </button>
                {activeDate && (
                    <div style={{ position: 'absolute', top: '15px', left: '20px', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                        {dateStr} の記録
                    </div>
                )}
                <div style={{ marginTop: '30px' }}></div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', overflowX: 'auto' }}>
                    <TabButton active={activeTab === 'camera'} onClick={() => setActiveTab('camera')} icon={<Camera size={16} />} label="写真" />
                    <TabButton active={activeTab === 'search'} onClick={() => setActiveTab('search')} icon={<Search size={16} />} label="検索" />
                    <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<Clock size={16} />} label="履歴" />
                    <TabButton active={activeTab === 'recipes'} onClick={() => setActiveTab('recipes')} icon={<BookOpen size={16} />} label="レシピ" />
                    <TabButton active={activeTab === 'manual'} onClick={() => setActiveTab('manual')} icon={<PenTool size={16} />} label="手入力" />
                </div>

                {pendingItems.length > 0 && (
                    <div onClick={() => setActiveTab('review')} style={{ background: 'var(--primary-glow)', color: 'var(--primary-dark)', padding: '8px', borderRadius: '8px', textAlign: 'center', marginBottom: '15px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>
                        {pendingItems.length}件のアイテムを確認待機中 →
                    </div>
                )}

                {/* --- CAMERA --- */}
                {activeTab === 'camera' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div onClick={() => fileInputRef.current?.click()} style={{ flex: 1, border: '2px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', maxHeight: '300px' }}>
                            <Camera size={48} color="var(--primary)" style={{ marginBottom: '16px' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>写真を撮影 / アップロード</p>
                            <input type="file" accept="image/*" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
                        </div>
                        {loading && <div style={{ textAlign: 'center', marginTop: '10px' }}><Loader2 className="spin" size={24} color="var(--primary)" /></div>}
                    </div>
                )}

                {/* --- SEARCH --- */}
                {activeTab === 'search' && (
                    <div className="fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>履歴に基づいた候補も表示されます。</p>
                        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {searchQueries.map((q, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '5px' }}>
                                        <input value={q} onChange={(e) => handleQueryChange(i, e.target.value)} placeholder="食べたもの" style={inputStyle} />
                                        {searchQueries.length > 1 && <button type="button" onClick={() => removeQueryInput(i)} style={{ border: 'none', background: 'none' }}><X size={16} /></button>}
                                    </div>
                                ))}
                            </div>
                            <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '0 15px' }}>{loading ? <Loader2 className="spin" /> : <Search />}</button>
                        </form>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {searchResults.map((item, i) => (
                                <div key={i} onClick={() => { addItemToPending(item, 'search'); alert('追加しました'); }} className="glass-panel hover-card" style={{ padding: '12px', marginBottom: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold' }}>{item.foodName}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.calories} kcal</div>
                                    </div>
                                    <Plus size={18} color="var(--primary)" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- HISTORY --- */}
                {activeTab === 'history' && (
                    <div className="fade-in" style={{ flex: 1, overflowY: 'auto' }}>
                        {historyItems.length === 0 ? <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>履歴がありません</p> :
                            historyItems.map((item) => (
                                <div key={item.id} onClick={() => handleAddHistoryItem(item)} className="glass-panel hover-card" style={{ padding: '12px', marginBottom: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold' }}>{item.foodName}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.calories} kcal</div>
                                    </div>
                                    <Plus size={18} color="var(--primary)" />
                                </div>
                            ))
                        }
                    </div>
                )}

                {/* --- RECIPES --- */}
                {activeTab === 'recipes' && (
                    <div className="fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {isCreatingRecipe ? (
                            <form onSubmit={handleCreateRecipe}>
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={labelStyle}>食材・調味料リスト (AI自動計算)</label>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <textarea
                                            placeholder="例: 鶏むね肉 300g, 玉ねぎ 1個, 醤油 大さじ1"
                                            value={recipeForm.ingredients}
                                            onChange={e => setRecipeForm({ ...recipeForm, ingredients: e.target.value })}
                                            style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                                        />
                                        <button type="button" onClick={handleCalculateRecipe} disabled={isCalculatingRecipe || !recipeForm.ingredients} style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', padding: '0 15px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', minWidth: '60px' }}>
                                            {isCalculatingRecipe ? <Loader2 size={16} className="spin" /> : <><Search size={16} /><span>計算</span></>}
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>食材を入力して「計算」を押すと、カロリーなどが自動入力されます。</p>
                                </div>
                                <div style={{ marginBottom: '10px' }}><label style={labelStyle}>レシピ名</label><input required style={inputStyle} value={recipeForm.foodName} onChange={e => setRecipeForm({ ...recipeForm, foodName: e.target.value })} /></div>
                                <div style={{ marginBottom: '10px' }}><label style={labelStyle}>カロリー (1人前)</label><input type="number" required style={inputStyle} value={recipeForm.calories} onChange={e => setRecipeForm({ ...recipeForm, calories: e.target.value })} /></div>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                    <div style={{ flex: 1 }}><label style={labelStyle}>タンパク質 (g)</label><input type="number" style={inputStyle} value={recipeForm.protein} onChange={e => setRecipeForm({ ...recipeForm, protein: e.target.value })} /></div>
                                    <div style={{ flex: 1 }}><label style={labelStyle}>脂質 (g)</label><input type="number" style={inputStyle} value={recipeForm.fat} onChange={e => setRecipeForm({ ...recipeForm, fat: e.target.value })} /></div>
                                    <div style={{ flex: 1 }}><label style={labelStyle}>炭水化物 (g)</label><input type="number" style={inputStyle} value={recipeForm.carbs} onChange={e => setRecipeForm({ ...recipeForm, carbs: e.target.value })} /></div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button type="button" onClick={() => setIsCreatingRecipe(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'white' }}>キャンセル</button>
                                    <button type="submit" className="btn-primary" style={{ flex: 1 }}>保存</button>
                                </div>
                            </form>
                        ) : recipeSearchMode ? (
                            /* Search Mode UI */
                            <div className="fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ marginBottom: '15px' }}>
                                    <button onClick={() => setRecipeSearchMode(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px' }}>
                                        <ChevronRight style={{ transform: 'rotate(180deg)' }} size={16} /> 戻る
                                    </button>
                                    <form onSubmit={handleSearchRecipe} style={{ display: 'flex', gap: '5px' }}>
                                        <input
                                            value={recipeSearchQuery}
                                            onChange={e => setRecipeSearchQuery(e.target.value)}
                                            placeholder="例: 高タンパクな鶏むね肉料理"
                                            style={inputStyle}
                                        />
                                        <button type="submit" className="btn-primary" disabled={isSearchingRecipe} style={{ padding: '0 15px' }}>
                                            {isSearchingRecipe ? <Loader2 className="spin" /> : <Search />}
                                        </button>
                                    </form>
                                </div>

                                {foundRecipes.length > 0 && (
                                    <div className="fade-in" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                        {foundRecipes.map((recipe, idx) => (
                                            <div key={idx} className="glass-panel" style={{ padding: '15px', border: '1px solid var(--primary-glow)' }}>
                                                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{recipe.foodName}</h3>
                                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>{recipe.description}</p>

                                                <div style={{ display: 'flex', gap: '15px', marginBottom: '10px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                                    <span>{recipe.calories} kcal</span>
                                                    <span style={{ color: 'var(--text-muted)' }}>P:{recipe.macros?.protein}g</span>
                                                </div>

                                                <button onClick={() => setViewingRecipe(recipe)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    詳細を見る <Sparkles size={14} />
                                                </button>

                                                <button onClick={() => importRecipe(recipe)} className="btn-primary" style={{ width: '100%' }}>
                                                    このレシピを取り込む
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Default List Mode */
                            <>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                    <button onClick={() => setIsCreatingRecipe(true)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px dashed var(--primary)', background: 'var(--primary-glow)', color: 'var(--primary-dark)', fontWeight: 'bold' }}>
                                        + 新規作成
                                    </button>
                                    <button onClick={() => setRecipeSearchMode(true)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'white', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                        <Sparkles size={16} /> AI検索
                                    </button>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    {recipes.map((recipe) => (
                                        <div key={recipe.id} onClick={() => handleSelectRecipe(recipe)} className="glass-panel hover-card" style={{ padding: '12px', marginBottom: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 'bold' }}>{recipe.foodName}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{recipe.calories} kcal/人前</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <button onClick={(e) => { e.stopPropagation(); setViewingRecipe(recipe); }} style={{ border: 'none', background: 'none', color: 'var(--primary)' }}>
                                                    <BookOpen size={18} />
                                                </button>
                                                <button onClick={(e) => handleDeleteRecipe(recipe.id, e)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Detail View Modal (For Found or Saved) */}
                        {viewingRecipe && (
                            <div className="fixed-overlay" style={{ ...overlayStyle, zIndex: 120 }}>
                                <div className="glass-panel zoom-in" style={{ width: '90%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '0' }}>
                                    <div style={{ padding: '15px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                                        <h3 style={{ margin: 0 }}>{viewingRecipe.foodName}</h3>
                                        <button onClick={() => setViewingRecipe(null)} style={{ background: 'none', border: 'none' }}><X /></button>
                                    </div>
                                    <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                                        {viewingRecipe.description && <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>{viewingRecipe.description}</p>}

                                        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', fontSize: '1rem', fontWeight: 'bold', background: 'var(--bg-main)', padding: '10px', borderRadius: '8px' }}>
                                            <span>{viewingRecipe.calories} kcal</span>
                                            <span style={{ color: 'var(--text-muted)' }}>P: {viewingRecipe.macros?.protein || viewingRecipe.protein}g</span>
                                        </div>

                                        <div style={{ marginBottom: '20px' }}>
                                            <h4 style={{ fontSize: '0.9rem', marginBottom: '5px' }}>材料</h4>
                                            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{viewingRecipe.ingredients || "なし"}</div>
                                        </div>

                                        {viewingRecipe.instructions && viewingRecipe.instructions.length > 0 && (
                                            <div style={{ marginBottom: '20px' }}>
                                                <h4 style={{ fontSize: '0.9rem', marginBottom: '5px' }}>手順</h4>
                                                <ol style={{ paddingLeft: '20px', margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                    {viewingRecipe.instructions.map((step, i) => <li key={i} style={{ marginBottom: '5px' }}>{step}</li>)}
                                                </ol>
                                            </div>
                                        )}

                                        {viewingRecipe.sourceQuery && (
                                            <a
                                                href={`https://www.google.com/search?q=${encodeURIComponent(viewingRecipe.sourceQuery)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{ display: 'block', marginTop: '20px', color: 'var(--secondary)', textDecoration: 'none', fontSize: '0.9rem' }}
                                            >
                                                🔍 Googleで関連レシピを検索
                                            </a>
                                        )}

                                        {!recipes.find(r => r.id === viewingRecipe.id) && (
                                            <button onClick={() => importRecipe(viewingRecipe)} className="btn-primary" style={{ width: '100%', marginTop: '20px' }}>
                                                このレシピを取り込む
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Portion Modal */}
                        {selectedRecipe && (
                            <div className="fixed-overlay" style={{ zIndex: 110 }}>
                                <div className="glass-panel zoom-in" style={{ padding: '20px', width: '300px', textAlign: 'center' }}>
                                    <h3>{selectedRecipe.foodName}</h3>
                                    <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>何人前食べましたか？</p>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '25px' }}>
                                        <button onClick={() => setPortionMultiplier(p => Math.max(0.5, p - 0.5))} style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid var(--border-subtle)', background: 'white' }}><Minus /></button>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{portionMultiplier} <span style={{ fontSize: '0.9rem' }}>人前</span></div>
                                        <button onClick={() => setPortionMultiplier(p => p + 0.5)} style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid var(--border-subtle)', background: 'white' }}><Plus /></button>
                                    </div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '25px' }}>
                                        {Math.round(selectedRecipe.calories * portionMultiplier)} kcal
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button onClick={() => setSelectedRecipe(null)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>キャンセル</button>
                                        <button onClick={confirmRecipeLog} className="btn-primary" style={{ flex: 1 }}>追加</button>
                                    </div>
                                </div>
                            </div>
                        )}


                    </div>
                )}

                {/* --- MANUAL --- */}
                {activeTab === 'manual' && (
                    <div className="fade-in" style={{ flex: 1 }}>
                        <form onSubmit={handleManualSubmit}>
                            <div style={{ marginBottom: '10px' }}><label style={labelStyle}>料理名</label><input required style={inputStyle} value={manualForm.foodName} onChange={e => setManualForm({ ...manualForm, foodName: e.target.value })} /></div>
                            <div style={{ marginBottom: '10px' }}><label style={labelStyle}>カロリー</label><input type="number" required style={inputStyle} value={manualForm.calories} onChange={e => setManualForm({ ...manualForm, calories: e.target.value })} /></div>
                            <div style={{ marginBottom: '20px' }}><label style={labelStyle}>タンパク質 (g)</label><input type="number" style={inputStyle} value={manualForm.protein} onChange={e => setManualForm({ ...manualForm, protein: e.target.value })} /></div>
                            <button type="submit" className="btn-primary" style={{ width: '100%' }}>追加</button>
                        </form>
                    </div>
                )}

            </div>

            {/* Delete Confirmation Modal - Moved outside glass-panel to avoid transform clipping */}
            {deleteConfirmation && (
                <div className="fixed-overlay" style={{ ...overlayStyle, zIndex: 120 }}>
                    <div className="glass-panel" style={{ padding: '20px', width: '300px', textAlign: 'center' }}>
                        <p style={{ marginBottom: '20px', fontWeight: 'bold' }}>レシピを削除しますか？</p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setDeleteConfirmation(null)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>キャンセル</button>
                            <button onClick={executeDeleteRecipe} className="btn-primary" style={{ flex: 1, background: '#ff4d4d', borderColor: '#ff4d4d' }}>削除</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const TabButton = ({ active, onClick, icon, label }) => (
    <button onClick={onClick} style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', background: active ? 'var(--primary-glow)' : 'transparent', border: active ? '1px solid var(--primary)' : '1px solid transparent', borderRadius: '20px', color: active ? 'var(--primary-dark)' : 'var(--text-secondary)', fontWeight: active ? 'bold' : 'normal', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
        {icon} <span style={{ fontSize: '0.85rem' }}>{label}</span>
    </button>
);
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' };
const inputStyle = { width: '100%', padding: '12px', background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none' };
const labelStyle = { display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' };
