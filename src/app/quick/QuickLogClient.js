"use client";
import { useState, useRef, useEffect, Suspense } from 'react';
import { Camera, Search, PenTool, Loader2, Check, ArrowLeft, X, Plus, Minus, History, Trash2 } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { analyzeImage } from '@/services/aiService';
import { searchAiFood } from '@/app/actions/food-search';
import { addMealToFirestore, getMealsFromFirestore, updateMealInFirestore, getRecentMeals } from '@/lib/firebase/firestore';
import { evaluateSingleMeal } from '@/app/actions/daily-evaluation';
import { setCache } from '@/utils/db';

const MEAL_LABELS = {
  breakfast: { label: '朝食', emoji: '🌅', color: '#F59E0B' },
  lunch: { label: '昼食', emoji: '☀️', color: '#3B82F6' },
  dinner: { label: '夕食', emoji: '🌙', color: '#8B5CF6' },
  snack: { label: '間食', emoji: '🍪', color: '#EC4899' },
};

function getDefaultMealType() {
  const h = new Date().getHours();
  if (h >= 4 && h < 10) return 'breakfast';
  if (h >= 10 && h < 16) return 'lunch';
  if (h >= 16 || h < 4) return 'dinner';
  return 'snack';
}

export default function QuickLogClient() {
  return (
    <Suspense fallback={
      <div style={styles.container}>
        <div style={styles.center}><Loader2 size={32} style={styles.spin} /></div>
      </div>
    }>
      <QuickLogContent />
    </Suspense>
  );
}

function QuickLogContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading, googleSignIn } = useAuth();

  const typeParam = searchParams.get('type');
  const mealType = MEAL_LABELS[typeParam] ? typeParam : getDefaultMealType();
  const mealInfo = MEAL_LABELS[mealType];

  // Mode: 'select' | 'camera' | 'search' | 'manual' | 'confirm' | 'done'
  const [mode, setMode] = useState('select');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Pending items (multi-meal support)
  const [pendingItems, setPendingItems] = useState([]);
  const [savedCount, setSavedCount] = useState(0);

  // History
  const [recentMeals, setRecentMeals] = useState([]);
  const [historySuggestions, setHistorySuggestions] = useState([]);

  // Camera
  const fileInputRef = useRef(null);
  const [cameraContext, setCameraContext] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Manual
  const [manualForm, setManualForm] = useState({ foodName: '', calories: '' });

  // Quantity (for confirm screen)
  const [quantity, setQuantity] = useState(1.0);

  // Load recent meals
  useEffect(() => {
    if (!user) return;
    getRecentMeals(user.uid, 100).then(meals => {
      setRecentMeals(meals);
    }).catch(() => {});
  }, [user]);

  // Filter history suggestions as user types
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 1) {
      setHistorySuggestions([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = recentMeals.filter(m =>
      m.foodName && m.foodName.toLowerCase().includes(q)
    ).slice(0, 8);
    setHistorySuggestions(matches);
  }, [searchQuery, recentMeals]);

  // Auto-close after save
  useEffect(() => {
    if (mode === 'done') {
      const timer = setTimeout(() => {
        if (window.opener || window.history.length <= 1) {
          window.close();
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  // === Camera Flow ===
  const handleCameraCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMode('camera');
    setIsProcessing(true);
    setError(null);
    try {
      const analysis = await analyzeImage(file, cameraContext);
      if (analysis.foodName && analysis.calories) {
        setResult({
          foodName: analysis.foodName,
          calories: analysis.calories,
          macros: analysis.macros || { protein: 0, fat: 0, carbs: 0 },
          reasoning: analysis.isMock ? 'モック結果' : 'AI解析',
        });
        setQuantity(1.0);
        setMode('confirm');
      } else {
        setError(analysis.error || '分析に失敗しました');
        setMode('select');
      }
    } catch {
      setError('画像の分析に失敗しました');
      setMode('select');
    } finally {
      setIsProcessing(false);
    }
    // Reset file input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // === Search Flow ===
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const historyContext = recentMeals.slice(0, 20).map(m => m.foodName).join(', ');
      const response = await searchAiFood(searchQuery, historyContext);
      const items = response?.suggestions || (Array.isArray(response) ? response : []);
      if (items.length > 0) {
        setSearchResults(items);
      } else {
        setSearchResults([]);
        setError('見つかりませんでした');
      }
    } catch {
      setError('検索に失敗しました');
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (item) => {
    setResult({
      foodName: item.foodName,
      calories: item.calories,
      macros: item.macros || { protein: 0, fat: 0, carbs: 0 },
      reasoning: item.source === 'history' || item.id ? '履歴から' : 'AI検索',
    });
    setQuantity(1.0);
    setMode('confirm');
  };

  // === Manual Flow ===
  const handleManualSubmit = () => {
    if (!manualForm.foodName.trim() || !manualForm.calories) return;
    setResult({
      foodName: manualForm.foodName.trim(),
      calories: Number(manualForm.calories),
      macros: { protein: 0, fat: 0, carbs: 0 },
      reasoning: '手入力',
    });
    setQuantity(1.0);
    setMode('confirm');
  };

  // === Add to pending list ===
  const addToPending = () => {
    if (!result) return;
    const item = {
      id: Date.now() + Math.random(),
      foodName: result.foodName,
      calories: Math.round(result.calories * quantity),
      macros: {
        protein: Math.round((result.macros?.protein || 0) * quantity),
        fat: Math.round((result.macros?.fat || 0) * quantity),
        carbs: Math.round((result.macros?.carbs || 0) * quantity),
      },
      reasoning: result.reasoning,
      quantity,
    };
    setPendingItems(prev => [...prev, item]);
    // Reset transient state
    setResult(null);
    setQuantity(1.0);
    setSearchQuery('');
    setSearchResults([]);
    setHistorySuggestions([]);
    setManualForm({ foodName: '', calories: '' });
    setCameraContext('');
    setMode('select');
  };

  const removePending = (id) => {
    setPendingItems(prev => prev.filter(p => p.id !== id));
  };

  // === Save All ===
  const handleSaveAll = async () => {
    if (pendingItems.length === 0 || !user) return;
    setIsProcessing(true);
    try {
      const now = new Date();
      const meals = pendingItems.map(p => ({
        foodName: p.foodName,
        calories: p.calories,
        macros: p.macros,
        reasoning: p.reasoning,
        mealType,
        timestamp: now.toISOString(),
        image: null,
      }));

      const addedIds = await Promise.all(meals.map(m => addMealToFirestore(user.uid, m)));
      setSavedCount(pendingItems.length);
      setPendingItems([]);
      setMode('done');

      // Background: cache update + evaluation
      (async () => {
        try {
          const allMeals = await getMealsFromFirestore(user.uid);
          setCache(`meals_${user.uid}`, allMeals).catch(() => {});

          const today = new Date();
          const sameDayMeals = allMeals.filter(m => {
            const d = new Date(m.timestamp);
            return d.getFullYear() === today.getFullYear() &&
              d.getMonth() === today.getMonth() &&
              d.getDate() === today.getDate();
          });

          await Promise.all(meals.map(async (meal, i) => {
            try {
              const evalResult = await evaluateSingleMeal({ ...meal, id: addedIds[i] }, sameDayMeals);
              if (typeof evalResult.score === 'number') {
                await updateMealInFirestore(user.uid, addedIds[i], {
                  score: evalResult.score,
                  reason: evalResult.reason,
                  assessment: evalResult.score >= 8 ? 'positive' : evalResult.score <= 3 ? 'negative' : 'neutral',
                });
              }
            } catch (err) {
              console.error('[QuickLog] Eval failed:', err);
            }
          }));
        } catch (err) {
          console.error('[QuickLog] Background tasks failed:', err);
        }
      })();
    } catch {
      setError('保存に失敗しました');
      setIsProcessing(false);
    }
  };

  const totalCalories = pendingItems.reduce((acc, p) => acc + (p.calories || 0), 0);

  // === Auth Loading ===
  if (authLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.center}><Loader2 size={32} style={styles.spin} /></div>
      </div>
    );
  }

  // === Not Logged In ===
  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.center}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>ログインが必要です</p>
          <button onClick={googleSignIn} style={styles.btnPrimary}>Googleでログイン</button>
        </div>
      </div>
    );
  }

  // === Done ===
  if (mode === 'done') {
    return (
      <div style={styles.container}>
        <div style={styles.center}>
          <div style={styles.doneIcon}>
            <Check size={48} color="#fff" />
          </div>
          <h2 style={{ margin: '16px 0 8px', color: 'var(--text-primary)' }}>記録完了!</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
            {mealInfo.emoji} {mealInfo.label} - {savedCount}件を記録しました
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={() => { setSavedCount(0); setMode('select'); }} style={styles.btnSecondary}>
              続けて記録
            </button>
            <button onClick={() => router.push('/')} style={styles.btnPrimary}>
              ダッシュボードへ
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === Confirm ===
  if (mode === 'confirm' && result) {
    const adjustedCal = Math.round(result.calories * quantity);
    const adjustedP = Math.round((result.macros?.protein || 0) * quantity);
    const adjustedF = Math.round((result.macros?.fat || 0) * quantity);
    const adjustedC = Math.round((result.macros?.carbs || 0) * quantity);

    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => { setMode('select'); setResult(null); setQuantity(1.0); }} style={styles.backBtn}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ ...styles.mealBadge, background: mealInfo.color }}>
            {mealInfo.emoji} {mealInfo.label}
          </div>
        </div>

        <div style={styles.confirmCard}>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--text-primary)' }}>{result.foodName}</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>{result.reasoning}</p>

          <div style={styles.quantityRow}>
            <button onClick={() => setQuantity(q => Math.max(0.25, Math.round((q - 0.25) * 100) / 100))} style={styles.quantityBtn}>
              <Minus size={18} />
            </button>
            <span style={styles.quantityLabel}>{quantity === 1 ? '1人前' : `${quantity}人前`}</span>
            <button onClick={() => setQuantity(q => Math.min(5, Math.round((q + 0.25) * 100) / 100))} style={styles.quantityBtn}>
              <Plus size={18} />
            </button>
          </div>

          <div style={styles.nutritionGrid}>
            <div style={styles.nutritionItem}>
              <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{adjustedCal}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>kcal</span>
            </div>
            <div style={styles.nutritionItem}>
              <span style={{ fontSize: 18, fontWeight: 600, color: '#EF4444' }}>{adjustedP}g</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>たんぱく質</span>
            </div>
            <div style={styles.nutritionItem}>
              <span style={{ fontSize: 18, fontWeight: 600, color: '#F59E0B' }}>{adjustedF}g</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>脂質</span>
            </div>
            <div style={styles.nutritionItem}>
              <span style={{ fontSize: 18, fontWeight: 600, color: '#3B82F6' }}>{adjustedC}g</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>炭水化物</span>
            </div>
          </div>

          <button onClick={addToPending} style={{ ...styles.btnPrimary, width: '100%', marginTop: 20 }}>
            <Plus size={20} /> リストに追加
          </button>
          {pendingItems.length > 0 && (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              追加後、選択画面で「記録する」ボタンから保存できます
            </p>
          )}
        </div>
      </div>
    );
  }

  // === Select Mode / Search / Manual ===
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => router.push('/')} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ ...styles.mealBadge, background: mealInfo.color }}>
          {mealInfo.emoji} {mealInfo.label}
        </div>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <div style={styles.overlay}>
          <Loader2 size={40} style={styles.spin} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)', marginTop: 12 }}>
            {mode === 'select' ? '保存中...' : '分析中...'}
          </p>
        </div>
      )}

      {/* Main Actions */}
      {mode === 'select' && !isProcessing && (
        <>
          <div style={styles.actions}>
            <button onClick={() => fileInputRef.current?.click()} style={styles.cameraBtn}>
              <Camera size={36} color="#fff" />
              <span style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginTop: 8 }}>写真で記録</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>撮影またはアルバムから</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCameraCapture}
              style={{ display: 'none' }}
            />

            <input
              type="text"
              placeholder="補足情報（例: コンビニのおにぎり）"
              value={cameraContext}
              onChange={(e) => setCameraContext(e.target.value)}
              style={styles.contextInput}
            />

            <div style={styles.secondaryRow}>
              <button onClick={() => setMode('search')} style={styles.secondaryBtn}>
                <Search size={22} color="var(--secondary)" />
                <span>検索</span>
              </button>
              <button onClick={() => setMode('manual')} style={styles.secondaryBtn}>
                <PenTool size={22} color="var(--accent-orange)" />
                <span>手入力</span>
              </button>
            </div>
          </div>

          {/* Pending Items List */}
          {pendingItems.length > 0 && (
            <div style={styles.pendingPanel}>
              <div style={styles.pendingHeader}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  追加済み ({pendingItems.length}件)
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>
                  合計 {totalCalories} kcal
                </span>
              </div>
              <div style={styles.pendingList}>
                {pendingItems.map(item => (
                  <div key={item.id} style={styles.pendingItem}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.foodName}
                        {item.quantity !== 1 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ×{item.quantity}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {item.calories} kcal ・ P:{item.macros.protein}g F:{item.macros.fat}g C:{item.macros.carbs}g
                      </div>
                    </div>
                    <button onClick={() => removePending(item.id)} style={styles.deleteBtn}>
                      <Trash2 size={16} color="var(--danger)" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={handleSaveAll} disabled={isProcessing} style={{ ...styles.btnPrimary, width: '100%', marginTop: 12 }}>
                {isProcessing ? <Loader2 size={20} style={styles.spin} /> : `${pendingItems.length}件を記録する`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Search Mode */}
      {mode === 'search' && (
        <div style={styles.searchPanel}>
          <div style={styles.searchBar}>
            <input
              type="text"
              placeholder="食べたものを入力..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={styles.searchInput}
              autoFocus
            />
            <button onClick={handleSearch} disabled={isSearching} style={styles.searchBtn}>
              {isSearching ? <Loader2 size={18} style={styles.spin} /> : <Search size={18} />}
            </button>
          </div>

          {/* History Suggestions */}
          {historySuggestions.length > 0 && searchResults.length === 0 && (
            <div>
              <div style={styles.sectionLabel}>
                <History size={14} /> 履歴から
              </div>
              <div style={styles.resultList}>
                {historySuggestions.map((item, i) => (
                  <button key={`h-${i}`} onClick={() => selectSearchResult({ ...item, source: 'history' })} style={styles.resultItem}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{item.foodName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        P:{item.macros?.protein || 0}g F:{item.macros?.fat || 0}g C:{item.macros?.carbs || 0}g
                      </div>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>{item.calories} kcal</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI Search Results */}
          {searchResults.length > 0 && (
            <div style={styles.resultList}>
              {searchResults.map((item, i) => (
                <button key={i} onClick={() => selectSearchResult(item)} style={styles.resultItem}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{item.foodName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      P:{item.macros?.protein || 0}g F:{item.macros?.fat || 0}g C:{item.macros?.carbs || 0}g
                    </div>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>{item.calories} kcal</span>
                </button>
              ))}
            </div>
          )}

          {/* Recent Meals (shown when search is empty) */}
          {!searchQuery && recentMeals.length > 0 && searchResults.length === 0 && (
            <div>
              <div style={styles.sectionLabel}>
                <History size={14} /> 最近の記録
              </div>
              <div style={styles.resultList}>
                {recentMeals.slice(0, 10).map((item, i) => (
                  <button key={`r-${i}`} onClick={() => selectSearchResult({ ...item, source: 'history' })} style={styles.resultItem}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{item.foodName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        P:{item.macros?.protein || 0}g F:{item.macros?.fat || 0}g C:{item.macros?.carbs || 0}g
                      </div>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>{item.calories} kcal</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => { setMode('select'); setSearchResults([]); setSearchQuery(''); setHistorySuggestions([]); }} style={styles.cancelLink}>
            戻る
          </button>
        </div>
      )}

      {/* Manual Mode */}
      {mode === 'manual' && (
        <div style={styles.manualPanel}>
          <input
            type="text"
            placeholder="食べたもの"
            value={manualForm.foodName}
            onChange={(e) => setManualForm(f => ({ ...f, foodName: e.target.value }))}
            style={styles.manualInput}
            autoFocus
          />
          <input
            type="number"
            placeholder="カロリー (kcal)"
            value={manualForm.calories}
            onChange={(e) => setManualForm(f => ({ ...f, calories: e.target.value }))}
            style={styles.manualInput}
            inputMode="numeric"
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualForm.foodName.trim() || !manualForm.calories}
            style={{ ...styles.btnPrimary, width: '100%', marginTop: 8 }}
          >
            確認へ
          </button>
          <button onClick={() => { setMode('select'); setManualForm({ foodName: '', calories: '' }); }} style={styles.cancelLink}>
            戻る
          </button>
        </div>
      )}
    </div>
  );
}

// === Styles ===
const styles = {
  container: {
    minHeight: '100dvh',
    background: 'var(--bg-main)',
    padding: '16px 16px env(safe-area-inset-bottom, 16px)',
    maxWidth: 480,
    margin: '0 auto',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '70dvh',
    textAlign: 'center',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    paddingTop: 'env(safe-area-inset-top, 8px)',
  },
  backBtn: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    padding: 8,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text-primary)',
  },
  mealBadge: {
    color: '#fff',
    padding: '6px 16px',
    borderRadius: 'var(--radius-lg)',
    fontSize: 15,
    fontWeight: 600,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 20,
  },
  cameraBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    padding: '32px 20px',
    cursor: 'pointer',
    boxShadow: '0 4px 16px var(--primary-glow)',
  },
  contextInput: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-card)',
    fontSize: 14,
    color: 'var(--text-primary)',
    outline: 'none',
  },
  secondaryRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  secondaryBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '20px 16px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  // Pending items panel
  pendingPanel: {
    marginTop: 20,
    padding: 16,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)',
  },
  pendingHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottom: '1px solid var(--border-subtle)',
  },
  pendingList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  pendingItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    background: 'var(--bg-main)',
    borderRadius: 'var(--radius-sm)',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    padding: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  // Search
  searchPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
  },
  searchBar: {
    display: 'flex',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-card)',
    fontSize: 16,
    color: 'var(--text-primary)',
    outline: 'none',
  },
  searchBtn: {
    padding: '12px 16px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  resultList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  resultItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    color: 'var(--text-primary)',
  },
  // Manual
  manualPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
  },
  manualInput: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-card)',
    fontSize: 16,
    color: 'var(--text-primary)',
    outline: 'none',
  },
  cancelLink: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '12px 0',
    textAlign: 'center',
  },
  // Confirm
  confirmCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)',
    padding: 24,
    marginTop: 8,
  },
  quantityRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: '12px 0',
    marginBottom: 16,
  },
  quantityBtn: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-card)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: 'var(--text-primary)',
  },
  quantityLabel: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-primary)',
    minWidth: 60,
    textAlign: 'center',
  },
  nutritionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr',
    gap: 8,
    textAlign: 'center',
  },
  nutritionItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  // Buttons
  btnPrimary: {
    padding: '14px 24px',
    borderRadius: 'var(--radius-lg)',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnSecondary: {
    padding: '12px 20px',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  errorBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: 'var(--radius-sm)',
    color: '#EF4444',
    fontSize: 14,
    marginBottom: 12,
  },
  overlay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '50dvh',
  },
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: 'var(--primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px var(--primary-glow)',
  },
  sectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-muted)',
    marginBottom: 8,
  },
  spin: {
    animation: 'spin 1s linear infinite',
  },
};
