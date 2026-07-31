'use client';

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AXIS_LABELS } from '@/lib/health/conditionRules';
import { MIN_SAMPLE_DAYS } from '@/lib/health/correlation';

/**
 * 予測 vs 実測の推移。
 *
 * 予測が当たっているかをユーザー自身に確かめてもらうための画面。
 * ズレを隠さず見せることで「学習中である」ことが伝わり、
 * スコアが体感と合わない時期の信頼低下を防ぐ。
 */
const SUBJECTIVE_TO_SCORE = 20; // 主観1-5 を 0-100 に写す

export default function ConditionTrendChart({ logs = [], axis = 'sleep' }) {
    const data = useMemo(() => {
        return logs
            .filter(log => log?.date)
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((log) => {
                const subjective = log?.[axis]?.subjective;
                const [, month, day] = log.date.split('-');
                return {
                    date: `${Number(month)}/${Number(day)}`,
                    predicted: log?.predicted?.[axis] ?? null,
                    // 1-5 の主観を 0-100 に揃えて重ねる（1→20, 5→100）
                    actual: typeof subjective === 'number' ? subjective * SUBJECTIVE_TO_SCORE : null,
                };
            })
            .filter(d => d.predicted !== null || d.actual !== null);
    }, [logs, axis]);

    const matchedDays = data.filter(d => d.predicted !== null && d.actual !== null).length;

    if (data.length === 0) {
        return (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                まだ推移を出せるデータがありません。記録を続けてくださいね😊
            </p>
        );
    }

    return (
        <div>
            <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                    <LineChart data={data} margin={{ top: 5, right: 8, left: -24, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                        <Tooltip
                            contentStyle={{ fontSize: '0.72rem', borderRadius: '8px' }}
                            formatter={(value, name) => [Math.round(value), name]}
                        />
                        <Legend wrapperStyle={{ fontSize: '0.68rem' }} />
                        <Line
                            type="monotone" dataKey="predicted" name="予測"
                            stroke="#667EEA" strokeWidth={2} dot={{ r: 2 }} connectNulls
                        />
                        <Line
                            type="monotone" dataKey="actual" name="実際の体感"
                            stroke="#68D391" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} connectNulls
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                {AXIS_LABELS[axis]}の予測と、あなたが答えた体感の比較です。
                {matchedDays < MIN_SAMPLE_DAYS * 2
                    ? `あと${MIN_SAMPLE_DAYS * 2 - matchedDays}日ぶんくらい揃うと、あなただけの傾向が見えてきます📊`
                    : 'ズレが続く場合は、あなた向けに重みを調整していきます📊'}
            </p>
        </div>
    );
}
