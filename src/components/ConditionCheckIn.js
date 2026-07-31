'use client';

import { useState, useEffect, useCallback } from 'react';
import { Moon, Brain, Settings2, Check, Loader2 } from 'lucide-react';
import {
    getConditionLog,
    saveConditionCheckIn,
    saveUserProfile,
} from '@/lib/firebase/firestore';
import {
    getLogicalDateKey,
    getSleepTargetDateKey,
    getJstParts,
    DEFAULT_SLEEP_SCHEDULE,
} from '@/lib/health/conditionDate';

// 体感の5段階。文字を読ませず1タップで終わらせるのが最優先。
const SCALE = [
    { value: 1, emoji: '😩', label: '最悪' },
    { value: 2, emoji: '😕', label: 'いまいち' },
    { value: 3, emoji: '😐', label: 'ふつう' },
    { value: 4, emoji: '🙂', label: 'よい' },
    { value: 5, emoji: '😄', label: '絶好調' },
];

// 集中力を朝に聞いても答えようがないので、この時刻以降だけ表示する
const FOCUS_PROMPT_FROM_HOUR = 14;

export default function ConditionCheckIn({
    user, userProfile, onProfileUpdate,
    openSettings = false, onSettingsHandled,
}) {
    const [sleepValue, setSleepValue] = useState(null);
    const [focusValue, setFocusValue] = useState(null);
    const [loading, setLoading] = useState(true);
    const [savingAxis, setSavingAxis] = useState(null);
    const [error, setError] = useState(null);
    const [showSettings, setShowSettings] = useState(false);

    const [bedtime, setBedtime] = useState(
        userProfile?.bedtime || DEFAULT_SLEEP_SCHEDULE.bedtime
    );
    const [wakeTime, setWakeTime] = useState(
        userProfile?.wakeTime || DEFAULT_SLEEP_SCHEDULE.wakeTime
    );
    const [savingProfile, setSavingProfile] = useState(false);

    // 睡眠は「その夜を引き起こした食事の日」に紐づくため、集中力とは別キーになる
    const sleepDateKey = getSleepTargetDateKey();
    const focusDateKey = getLogicalDateKey();
    // 日付キーと同じく JST 基準で判定する（端末のタイムゾーンに引きずられないため）
    const currentHour = getJstParts().hour;
    const showFocus = currentHour >= FOCUS_PROMPT_FROM_HOUR || focusValue != null;

    useEffect(() => {
        setBedtime(userProfile?.bedtime || DEFAULT_SLEEP_SCHEDULE.bedtime);
        setWakeTime(userProfile?.wakeTime || DEFAULT_SLEEP_SCHEDULE.wakeTime);
    }, [userProfile?.bedtime, userProfile?.wakeTime]);

    // コンディションカードの「就寝時刻を設定」からも開けるようにする
    useEffect(() => {
        if (!openSettings) return;
        setShowSettings(true);
        onSettingsHandled?.();
    }, [openSettings, onSettingsHandled]);

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }
        let cancelled = false;

        (async () => {
            const [sleepLog, focusLog] = await Promise.all([
                getConditionLog(user.uid, sleepDateKey),
                getConditionLog(user.uid, focusDateKey),
            ]);
            if (cancelled) return;
            setSleepValue(sleepLog?.sleep?.subjective ?? null);
            setFocusValue(focusLog?.focus?.subjective ?? null);
            setLoading(false);
        })();

        return () => { cancelled = true; };
    }, [user?.uid, sleepDateKey, focusDateKey]);

    const handleSelect = useCallback(async (axis, value) => {
        if (!user?.uid) return;
        const dateKey = axis === 'sleep' ? sleepDateKey : focusDateKey;
        const setter = axis === 'sleep' ? setSleepValue : setFocusValue;
        const previous = axis === 'sleep' ? sleepValue : focusValue;

        setter(value);          // 楽観的更新（1タップの体験を止めない）
        setSavingAxis(axis);
        setError(null);
        try {
            await saveConditionCheckIn(user.uid, dateKey, axis, value);
        } catch (e) {
            console.error('[ConditionCheckIn] save failed:', e);
            setter(previous);   // 失敗したら元に戻す
            setError('保存に失敗しました。もう一度お試しください。');
        } finally {
            setSavingAxis(null);
        }
    }, [user?.uid, sleepDateKey, focusDateKey, sleepValue, focusValue]);

    const handleSaveSchedule = async () => {
        if (!user?.uid) return;
        setSavingProfile(true);
        setError(null);
        try {
            await saveUserProfile(user.uid, { bedtime, wakeTime });
            onProfileUpdate?.({ bedtime, wakeTime });
            setShowSettings(false);
        } catch (e) {
            console.error('[ConditionCheckIn] profile save failed:', e);
            setError('生活リズムの保存に失敗しました。');
        } finally {
            setSavingProfile(false);
        }
    };

    if (!user) return null;

    return (
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Brain size={15} color="var(--primary)" /> 今日の体感
                </h3>
                <button
                    type="button"
                    onClick={() => setShowSettings(v => !v)}
                    aria-label="生活リズム設定"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex' }}
                >
                    <Settings2 size={15} />
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '8px 0' }}>
                    <Loader2 size={14} className="spin" /> 読み込み中...
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <ScaleRow
                        icon={<Moon size={14} />}
                        title="昨夜はよく眠れましたか？"
                        value={sleepValue}
                        saving={savingAxis === 'sleep'}
                        onSelect={(v) => handleSelect('sleep', v)}
                    />

                    {showFocus ? (
                        <ScaleRow
                            icon={<Brain size={14} />}
                            title="今日の集中力はどうでしたか？"
                            value={focusValue}
                            saving={savingAxis === 'focus'}
                            onSelect={(v) => handleSelect('focus', v)}
                        />
                    ) : (
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
                            集中力は夕方ごろにお聞きしますね😊
                        </p>
                    )}
                </div>
            )}

            {error && (
                <p role="alert" style={{ fontSize: '0.72rem', color: '#E53E3E', margin: '10px 0 0' }}>{error}</p>
            )}

            {showSettings && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                        就寝時刻は「夕食が睡眠にどう響いたか」の判定に使います🌙
                    </p>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                        <label style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            就寝時刻
                            <input
                                type="time"
                                value={bedtime}
                                onChange={(e) => setBedtime(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
                        <label style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            起床時刻
                            <input
                                type="time"
                                value={wakeTime}
                                onChange={(e) => setWakeTime(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={handleSaveSchedule}
                            disabled={savingProfile}
                            style={{ padding: '8px 14px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                        >
                            {savingProfile ? '保存中' : '保存'}
                        </button>
                    </div>
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

function ScaleRow({ icon, title, value, saving, onSelect }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{icon}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{title}</span>
                {value != null && !saving && (
                    <Check size={13} color="#68D391" aria-label="記録済み" />
                )}
                {saving && <Loader2 size={13} className="spin" color="var(--text-muted)" />}
            </div>
            <div role="radiogroup" aria-label={title} style={{ display: 'flex', gap: '6px' }}>
                {SCALE.map(({ value: v, emoji, label }) => {
                    const selected = value === v;
                    return (
                        <button
                            key={v}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={label}
                            title={label}
                            onClick={() => onSelect(v)}
                            style={{
                                flex: 1,
                                padding: '8px 0',
                                fontSize: '1.25rem',
                                lineHeight: 1,
                                cursor: 'pointer',
                                borderRadius: '10px',
                                border: selected ? '2px solid var(--primary)' : '1px solid var(--border-subtle)',
                                background: selected ? 'rgba(102, 126, 234, 0.12)' : 'var(--bg-main)',
                                opacity: value != null && !selected ? 0.45 : 1,
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {emoji}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
