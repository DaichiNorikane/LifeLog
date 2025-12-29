"use client";
import { useState, useRef } from 'react';
import { Camera, X, Loader2, Search, PenTool, Image as ImageIcon, ChevronRight, Trash2 } from 'lucide-react';
import { analyzeImage } from '@/services/aiService';
import { searchFoodWithGemini } from '@/app/actions';

export default function FoodLogger({ onLogMeal, onCancel, activeDate }) {
    const [activeTab, setActiveTab] = useState('camera'); // 'camera', 'search', 'manual', 'review'
    const [loading, setLoading] = useState(false);

    // Bulk Logic: Main State
    const [pendingItems, setPendingItems] = useState([]); // { id, type, content, status, result: { foodName, calories, macros... } }

    // Camera State
    const [scanStep, setScanStep] = useState(0);
    const fileInputRef = useRef(null);

    // Search State
    const [searchQueries, setSearchQueries] = useState(['']); // Array of strings
    const [searchResults, setSearchResults] = useState([]);

    // Manual State
    const [manualForm, setManualForm] = useState({ foodName: '', calories: '', protein: '' });

    // Format date for display
    const dateStr = activeDate ?
        `${activeDate.getMonth() + 1}/${activeDate.getDate()} (${['日', '月', '火', '水', '木', '金', '土'][activeDate.getDay()]})`
        : '';

    // --- Handlers ---

    // Helper: Resize image to avoid Firestore 1MB limit
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
                    resolve(canvas.toDataURL('image/jpeg', 0.6)); // High compression
                };
            };
        });
    };

    // 1. Image Handling (Bulk)
    const handleFileSelect = async (e) => { // Made async
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setScanStep(1);
        setLoading(true);

        const newItems = files.map(file => ({
            id: Date.now() + Math.random(),
            type: 'image',
            status: 'analyzing',
            file: file,
            preview: null
        }));

        setPendingItems(prev => [...prev, ...newItems]);

        // Process each image
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const item = newItems[i];

            try {
                // Resize FIRST
                const resizedImage = await resizeImage(file);

                // Update preview with resized image
                updateItem(item.id, { preview: resizedImage });

                // Analyze
                setScanStep(2);
                const result = await analyzeImage(file); // sending original file to AI service (it has its own resizer)

                updateItem(item.id, {
                    status: 'done',
                    result: { ...result, image: resizedImage } // Store RESIZED image in result
                });
            } catch (error) {
                console.error("Analysis failed", error);
                updateItem(item.id, { status: 'error', result: { foodName: '解析エラー', calories: 0 } });
            }
        }

        setLoading(false);
        setScanStep(0);
        setActiveTab('review');
    };

    const updateItem = (id, updates) => {
        setPendingItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    };

    const removeItem = (id) => {
        setPendingItems(prev => prev.filter(item => item.id !== id));
    };

    // 2. Search Handling
    // Helper to manage inputs
    const handleQueryChange = (index, value) => {
        const newQueries = [...searchQueries];
        newQueries[index] = value;
        setSearchQueries(newQueries);
    };

    const addQueryInput = () => {
        setSearchQueries(prev => [...prev, '']);
    };

    const removeQueryInput = (index) => {
        if (searchQueries.length > 1) {
            setSearchQueries(prev => prev.filter((_, i) => i !== index));
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        // Combine valid queries
        const combinedQuery = searchQueries.filter(q => q.trim()).join('と');
        if (!combinedQuery) return;

        setLoading(true);
        try {
            const res = await searchFoodWithGemini(combinedQuery);
            if (res.suggestions) {
                setSearchResults(res.suggestions);
            }
        } catch (error) {
            console.error("search failed", error);
        } finally {
            setLoading(false);
        }
    };

    const addSearchResult = (item) => {
        const newItem = {
            id: Date.now() + Math.random(), // Ensure unique ID
            type: 'search',
            status: 'done',
            result: {
                foodName: item.foodName,
                calories: item.calories,
                macros: item.macros,
                reasoning: item.reasoning,
                image: null
            }
        };
        setPendingItems(prev => [...prev, newItem]);
        alert(`${item.foodName} を追加しました`); // Simple feedback for now
    };

    // 3. Manual Handling
    const handleManualSubmit = (e) => {
        e.preventDefault();
        const newItem = {
            id: Date.now(),
            type: 'manual',
            status: 'done',
            result: {
                foodName: manualForm.foodName,
                calories: parseInt(manualForm.calories || 0),
                macros: { protein: parseInt(manualForm.protein || 0), fat: 0, carbs: 0 },
                reasoning: "手入力",
                image: null
            }
        };
        setPendingItems(prev => [...prev, newItem]);
        setManualForm({ foodName: '', calories: '', protein: '' });
        setActiveTab('review');
    };

    // 4. Final Log
    const logAllItems = async () => {
        const validItems = pendingItems.filter(i => i.status === 'done' && i.result);
        if (validItems.length === 0) return;

        const mealsToLog = validItems.map(item => ({
            ...item.result,
            timestamp: new Date().toISOString()
        }));

        await onLogMeal(mealsToLog);
    };

    // --- Render ---

    // Review Tab (Cart View)
    if (activeTab === 'review') {
        const totalCals = pendingItems.reduce((acc, item) => acc + (item.result?.calories || 0), 0);

        return (
            <div className="fixed-overlay" style={{ ...overlayStyle }}>
                <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '400px', padding: '20px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
                        <h3 className="title-gradient" style={{ margin: 0 }}>記録の確認 ({pendingItems.length})</h3>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setActiveTab('camera')} style={{ background: 'var(--bg-main)', border: 'none', color: 'var(--primary)', padding: '5px 10px', borderRadius: '15px', fontSize: '0.8rem' }}>+ 追加</button>
                            <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)' }}><X size={20} /></button>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
                        {pendingItems.length === 0 && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                                アイテムがありません。<br />「追加」ボタンから食事を記録してください。
                            </div>
                        )}
                        {pendingItems.map((item) => (
                            <div key={item.id} className="glass-panel" style={{ padding: '10px', marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
                                {item.status === 'analyzing' ? (
                                    <div style={{ width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', borderRadius: '8px' }}>
                                        <Loader2 className="spin" size={20} color="var(--primary)" />
                                    </div>
                                ) : (
                                    item.result?.image ?
                                        <img src={item.result.image} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} /> :
                                        <div style={{ width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', borderRadius: '8px', color: 'var(--primary)' }}>
                                            <PenTool size={20} />
                                        </div>
                                )}

                                <div style={{ flex: 1 }}>
                                    {item.status === 'analyzing' ? (
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>解析中...</div>
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

                                <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontWeight: 'bold' }}>
                            <span>合計</span>
                            <span>{totalCals} kcal</span>
                        </div>
                        <button className="btn-primary" style={{ width: '100%' }} onClick={logAllItems} disabled={pendingItems.length === 0 || loading}>
                            すべて記録する
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Main Input UI
    return (
        <div className="fixed-overlay" style={{ ...overlayStyle }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '20px', minHeight: '500px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <button onClick={onCancel} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', zIndex: 10, cursor: 'pointer' }}>
                    <X />
                </button>

                {activeDate && (
                    <div style={{ position: 'absolute', top: '15px', left: '20px', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                        {dateStr} の記録
                    </div>
                )}

                <div style={{ marginTop: '25px' }}></div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginRight: '30px' }}>
                    <TabButton active={activeTab === 'camera'} onClick={() => setActiveTab('camera')} icon={<Camera size={18} />} label="写真" />
                    <TabButton active={activeTab === 'search'} onClick={() => setActiveTab('search')} icon={<Search size={18} />} label="検索" />
                    <TabButton active={activeTab === 'manual'} onClick={() => setActiveTab('manual')} icon={<PenTool size={18} />} label="手入力" />
                </div>

                {/* Use pending count badge if items exist */}
                {pendingItems.length > 0 && (
                    <div onClick={() => setActiveTab('review')} style={{ background: 'var(--primary-glow)', color: 'var(--primary-dark)', padding: '8px', borderRadius: '8px', textAlign: 'center', marginBottom: '15px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>
                        {pendingItems.length}件のアイテムを確認待機中 →
                    </div>
                )}

                {/* --- CAMERA TAB --- */}
                {activeTab === 'camera' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            style={{ flex: 1, border: '2px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', minHeight: '300px' }}
                        >
                            <Camera size={48} color="var(--primary)" style={{ marginBottom: '16px' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>写真を撮影 / アップロード</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>複数枚の選択も可能です</p>
                            <input
                                type="file"
                                accept="image/*"
                                multiple // Enable multiple
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleFileSelect}
                            />
                        </div>
                        {loading && (
                            <div style={{ textAlign: 'center', marginTop: '10px', color: 'var(--primary)' }}>
                                <Loader2 className="spin" style={{ display: 'inline-block', marginRight: '8px' }} />
                                解析を開始しています...
                            </div>
                        )}
                    </div>
                )}

                {/* --- SEARCH TAB --- */}
                {activeTab === 'search' && (
                    <div className="fade-in" style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                            食べたものを入力してください。複数をまとめて検索できます。
                        </p>
                        <form onSubmit={handleSearch} style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {searchQueries.map((q, index) => (
                                    <div key={index} style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            value={q}
                                            onChange={(e) => handleQueryChange(index, e.target.value)}
                                            placeholder={`例: ${index === 0 ? 'ラーメン' : '餃子'}`}
                                            autoFocus={index === 0} // Check this
                                            style={{ ...inputStyle, flex: 1 }}
                                        />
                                        {searchQueries.length > 1 && (
                                            <button type="button" onClick={() => removeQueryInput(index)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
                                                <X size={18} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={addQueryInput} style={{ flex: 1, padding: '8px', border: '1px dashed var(--primary)', background: 'transparent', color: 'var(--primary)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                                    + アイテムを追加
                                </button>
                                <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '0 20px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    {loading ? <Loader2 className="spin" size={18} /> : <><Search size={18} /> 検索</>}
                                </button>
                            </div>
                        </form>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                            {searchResults.map((item, i) => (
                                <div key={i} onClick={() => addSearchResult(item)} className="glass-panel" style={{ padding: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold' }}>{item.foodName}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{item.calories} kcal • P:{item.macros?.protein}g</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{item.reasoning}</div>
                                    </div>
                                    <div style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- MANUAL TAB --- */}
                {activeTab === 'manual' && (
                    <div className="fade-in" style={{ flex: 1 }}>
                        <form onSubmit={handleManualSubmit}>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={labelStyle}>料理名</label>
                                <input
                                    required
                                    value={manualForm.foodName}
                                    onChange={(e) => setManualForm({ ...manualForm, foodName: e.target.value })}
                                    style={inputStyle}
                                />
                            </div>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={labelStyle}>カロリー (kcal)</label>
                                <input
                                    required
                                    type="number"
                                    value={manualForm.calories}
                                    onChange={(e) => setManualForm({ ...manualForm, calories: e.target.value })}
                                    style={inputStyle}
                                />
                            </div>
                            <div style={{ marginBottom: '25px' }}>
                                <label style={labelStyle}>タンパク質 (g) <span style={{ fontSize: '0.8em', opacity: 0.7 }}>(任意)</span></label>
                                <input
                                    type="number"
                                    value={manualForm.protein}
                                    onChange={(e) => setManualForm({ ...manualForm, protein: e.target.value })}
                                    style={inputStyle}
                                />
                            </div>
                            <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                                リストに追加
                            </button>
                        </form>
                    </div>
                )}

            </div>
        </div>
    );
}

// Sub-components & Styles
const TabButton = ({ active, onClick, icon, label }) => (
    <button
        onClick={onClick}
        style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px',
            background: active ? 'var(--primary-glow)' : 'transparent',
            border: active ? '1px solid var(--primary)' : '1px solid transparent',
            borderRadius: '8px',
            color: active ? 'var(--primary-dark)' : 'var(--text-secondary)',
            fontWeight: active ? 'bold' : 'normal',
            cursor: 'pointer',
            transition: 'all 0.2s'
        }}
    >
        {icon} <span style={{ fontSize: '0.9rem' }}>{label}</span>
    </button>
);

const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    zIndex: 100, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '20px'
};

const inputStyle = {
    width: '100%', padding: '12px', background: '#FFFFFF',
    border: '1px solid var(--border-subtle)', borderRadius: '8px',
    color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
};

const labelStyle = {
    display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem'
};
