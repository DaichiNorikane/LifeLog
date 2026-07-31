'use client';

import { useState, useEffect, useCallback } from 'react';
import { Coffee, Plus, Trash2, Loader2, X } from 'lucide-react';
import { addDrinkPreset, getDrinkPresets, deleteDrinkPreset } from '@/lib/firebase/firestore';
import { DEFAULT_DRINK_PRESETS, drinkPresetToMeal } from '@/lib/health/drinkPresets';

/**
 * 飲み物のワンタップ記録。
 * カフェイン・アルコールは AI 推定に頼らず固定値で記録する（睡眠判定の精度を守るため）。
 */
export default function DrinkQuickLog({ user, onLogDrink }) {
    const [customPresets, setCustomPresets] = useState([]);
    const [loggingKey, setLoggingKey] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({ name: '', calories: '', caffeine: '', alcohol: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user?.uid) return;
        let cancelled = false;
        getDrinkPresets(user.uid).then(presets => {
            if (!cancelled) setCustomPresets(presets);
        });
        return () => { cancelled = true; };
    }, [user?.uid]);

    const handleLog = useCallback(async (preset, key) => {
        setLoggingKey(key);
        setError(null);
        try {
            await onLogDrink(drinkPresetToMeal(preset));
        } catch (e) {
            console.error('[DrinkQuickLog] log failed:', e);
            setError('記録に失敗しました。');
        } finally {
            setLoggingKey(null);
        }
    }, [onLogDrink]);

    const handleSavePreset = async () => {
        const name = form.name.trim();
        if (!user?.uid || !name) return;

        setSaving(true);
        setError(null);
        try {
            // 入力されなかった値は null（不明）ではなく 0 として扱う。
            // 自分で登録した飲み物なので「入れていない＝含まない」が正しい。
            const preset = {
                name,
                calories: Number(form.calories) || 0,
                macros: {
                    protein: 0,
                    fat: 0,
                    carbs: 0,
                    caffeine: Number(form.caffeine) || 0,
                    alcohol: Number(form.alcohol) || 0,
                },
            };
            const id = await addDrinkPreset(user.uid, preset);
            setCustomPresets(prev => [{ id, ...preset }, ...prev]);
            setForm({ name: '', calories: '', caffeine: '', alcohol: '' });
            setShowForm(false);
        } catch (e) {
            console.error('[DrinkQuickLog] save preset failed:', e);
            setError('登録に失敗しました。');
        } finally {
            setSaving(false);
        }
    };

    const handleDeletePreset = async (presetId) => {
        if (!user?.uid) return;
        const previous = customPresets;
        setCustomPresets(prev => prev.filter(p => p.id !== presetId));
        try {
            await deleteDrinkPreset(user.uid, presetId);
        } catch (e) {
            console.error('[DrinkQuickLog] delete preset failed:', e);
            setCustomPresets(previous);
            setError('削除に失敗しました。');
        }
    };

    if (!user) return null;

    return (
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Coffee size={15} color="var(--primary)" /> マイドリンク
                </h3>
                <button
                    type="button"
                    onClick={() => setShowForm(v => !v)}
                    aria-label={showForm ? '登録フォームを閉じる' : '飲み物を登録'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex' }}
                >
                    {showForm ? <X size={15} /> : <Plus size={15} />}
                </button>
            </div>

            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                タップで記録します。飲んだ時刻がそのまま睡眠の判定に使われます⏰
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {DEFAULT_DRINK_PRESETS.map((preset) => (
                    <DrinkChip
                        key={preset.key}
                        label={`${preset.emoji} ${preset.name}`}
                        busy={loggingKey === preset.key}
                        onClick={() => handleLog(preset, preset.key)}
                    />
                ))}
                {customPresets.map((preset) => (
                    <DrinkChip
                        key={preset.id}
                        label={preset.name}
                        busy={loggingKey === preset.id}
                        onClick={() => handleLog(preset, preset.id)}
                        onDelete={() => handleDeletePreset(preset.id)}
                    />
                ))}
            </div>

            {error && (
                <p role="alert" style={{ fontSize: '0.72rem', color: '#E53E3E', margin: '10px 0 0' }}>{error}</p>
            )}

            {showForm && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                        <label style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            名前
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="例: いつものコンビニコーヒー"
                                style={inputStyle}
                            />
                        </label>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            カロリー (kcal)
                            <input
                                type="number" inputMode="numeric" min="0"
                                value={form.calories}
                                onChange={(e) => setForm({ ...form, calories: e.target.value })}
                                style={inputStyle}
                            />
                        </label>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            カフェイン (mg)
                            <input
                                type="number" inputMode="numeric" min="0"
                                value={form.caffeine}
                                onChange={(e) => setForm({ ...form, caffeine: e.target.value })}
                                style={inputStyle}
                            />
                        </label>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            アルコール (g)
                            <input
                                type="number" inputMode="decimal" min="0" step="0.1"
                                value={form.alcohol}
                                onChange={(e) => setForm({ ...form, alcohol: e.target.value })}
                                style={inputStyle}
                            />
                        </label>
                    </div>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={handleSavePreset}
                        disabled={saving || !form.name.trim()}
                        style={{ width: '100%', padding: '9px', fontSize: '0.8rem' }}
                    >
                        {saving ? '登録中...' : 'マイドリンクに登録'}
                    </button>
                </div>
            )}
        </div>
    );
}

const inputStyle = {
    display: 'block',
    width: '100%',
    marginTop: '4px',
    padding: '8px',
    borderRadius: '8px',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-main)',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
};

function DrinkChip({ label, busy, onClick, onDelete }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
                type="button"
                onClick={onClick}
                disabled={busy}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '7px 11px',
                    fontSize: '0.75rem',
                    cursor: busy ? 'wait' : 'pointer',
                    borderRadius: onDelete ? '14px 0 0 14px' : '14px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-primary)',
                }}
            >
                {busy && <Loader2 size={11} className="spin" />}
                {label}
            </button>
            {onDelete && (
                <button
                    type="button"
                    onClick={onDelete}
                    aria-label={`${label}を削除`}
                    style={{
                        padding: '7px 8px',
                        cursor: 'pointer',
                        borderRadius: '0 14px 14px 0',
                        border: '1px solid var(--border-subtle)',
                        borderLeft: 'none',
                        background: 'var(--bg-main)',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    <Trash2 size={11} />
                </button>
            )}
        </span>
    );
}
