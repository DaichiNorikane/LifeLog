'use client';

import { Activity, X } from 'lucide-react';
import ActivityCard from '@/components/ActivityCard';
import DietGoalPanel from '@/components/DietGoalPanel';

/**
 * 「今日のからだ」の詳細。
 *
 * 上段グリッドの要約カードをタップすると開く。
 * 実測（ActivityCard）と目標（DietGoalPanel）を1つの画面にまとめることで、
 * 体重が2箇所に出ていた重複を解消している。
 *
 * 分担:
 *   ActivityCard   … 今日の実測（歩数・消費・睡眠・ワークアウト・体組成）
 *   DietGoalPanel  … 目標（いつまでに何kg）と推移グラフ、エレナの目標診断
 */
export default function BodyDetailModal({
    user,
    userProfile,
    weights = [],
    activity = null,
    body = null,
    sleep = null,
    sleepLabel = '昨夜の睡眠',
    workouts = [],
    title = '今日のからだ',
    onClose,
    onUpdateWeights,
    ...panelProps
}) {
    return (
        <div className="fixed-overlay">
            <div
                className="glass-panel zoom-in"
                style={{
                    width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto',
                    padding: 0, position: 'relative', display: 'flex', flexDirection: 'column',
                }}
            >
                <div style={{
                    padding: '20px', borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    position: 'sticky', top: 0, background: 'rgba(255,255,255,0.9)',
                    backdropFilter: 'blur(10px)', zIndex: 10,
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Activity color="var(--primary)" /> {title}
                    </h2>
                    <button
                        onClick={onClose}
                        aria-label="閉じる"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                        <X size={24} />
                    </button>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <ActivityCard
                        title="今日の実測"
                        activity={activity}
                        body={body}
                        sleep={sleep}
                        sleepLabel={sleepLabel}
                        workouts={workouts}
                    />

                    <DietGoalPanel
                        user={user}
                        userProfile={userProfile}
                        weights={weights}
                        onClose={onClose}
                        onUpdateWeights={onUpdateWeights}
                        {...panelProps}
                    />
                </div>
            </div>
        </div>
    );
}
