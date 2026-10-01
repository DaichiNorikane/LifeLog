'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import { buildShareText } from '@/lib/share/shareReport';

/**
 * 「LINE共有用に出力」で開くパネル。
 *
 * テキストは shareReport.js（LINE 側と共通）で組み立て、
 * グラフは /api/share/chart の PNG（LINE に届く画像と同じもの）を出す。
 * 共有シート（navigator.share）が使える端末では、テキストと画像をまとめて LINE に渡せる。
 */
const SECONDARY_BUTTON = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    padding: '12px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)',
    background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer',
    fontSize: '0.9rem', textDecoration: 'none',
};

export default function ShareReportPanel({
    user,
    dateKey,
    totalCalories = null,
    targetCalories = null,
    weights = [],
    onClose,
}) {
    const text = useMemo(
        () => buildShareText({ dateId: dateKey, totalCalories, targetCalories, weights }),
        [dateKey, totalCalories, targetCalories, weights],
    );
    const [chartPath, setChartPath] = useState(null);
    const [chartState, setChartState] = useState('loading'); // loading | ready | unavailable
    const [copied, setCopied] = useState(false);
    const [shareError, setShareError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const idToken = await user?.getIdToken?.();
                // 開いたときだけ読む（Server Action の参照を「からだ」画面の初期表示に載せない）
                const { createShareChartPathAction } = await import('@/app/actions/share');
                const path = idToken ? await createShareChartPathAction(idToken) : null;
                if (cancelled) return;
                if (path) {
                    setChartPath(`${path}&date=${encodeURIComponent(dateKey)}`);
                    setChartState('ready');
                } else {
                    setChartState('unavailable');
                }
            } catch {
                if (!cancelled) setChartState('unavailable');
            }
        })();
        return () => { cancelled = true; };
    }, [user, dateKey]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setShareError('コピーできませんでした。テキストを長押しして選択してください');
        }
    };

    const handleShare = async () => {
        setShareError(null);
        try {
            const data = { text };
            if (chartPath) {
                const blob = await (await fetch(chartPath)).blob();
                const file = new File([blob], `lifelog-${dateKey}.png`, { type: 'image/png' });
                if (navigator.canShare?.({ files: [file] })) data.files = [file];
            }
            await navigator.share(data);
        } catch (e) {
            if (e?.name !== 'AbortError') setShareError('共有シートを開けませんでした。コピーと画像保存を使ってください');
        }
    };

    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    return (
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>LINE共有用</h3>
                {onClose && (
                    <button
                        onClick={onClose}
                        aria-label="共有パネルを閉じる"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                        <X size={20} />
                    </button>
                )}
            </div>

            <pre
                data-testid="share-text"
                style={{
                    margin: 0, padding: '12px', whiteSpace: 'pre-wrap', fontFamily: 'inherit',
                    fontSize: '0.9rem', lineHeight: 1.6, background: 'var(--bg-secondary, #f8fafc)',
                    borderRadius: '8px', userSelect: 'text',
                }}
            >
                {text}
            </pre>

            {chartState === 'loading' && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>グラフを作成中…</p>
            )}
            {chartState === 'ready' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={chartPath}
                    alt="体重・体脂肪率の推移グラフ"
                    style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
                />
            )}
            {chartState === 'unavailable' && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    グラフ画像は出力できませんでした（テキストのみ共有できます）
                </p>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {canShare && (
                    <button className="btn-primary" onClick={handleShare} style={{ flex: 1 }}>
                        <Share2 size={16} /> LINEなどに送る
                    </button>
                )}
                <button onClick={handleCopy} style={SECONDARY_BUTTON}>
                    {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'コピーしました' : 'テキストをコピー'}
                </button>
                {chartState === 'ready' && (
                    <a href={chartPath} download={`lifelog-${dateKey}.png`} style={SECONDARY_BUTTON}>
                        <Download size={16} /> 画像を保存
                    </a>
                )}
            </div>

            {shareError && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--danger, #dc2626)' }}>{shareError}</p>}
        </div>
    );
}
