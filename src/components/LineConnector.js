'use client';
import { useState } from 'react';
import { saveLinkCode } from '@/lib/firebase/firestore'; // Check if I exported this
import { db } from '@/lib/firebase/config'; // Direct use for now if export is tricky or use action
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
// Note: Client-side firestore usage is fine here as per existing pattern

export default function LineConnector({ userId, profile, variant = 'default' }) {
    console.log('[LineConnector] Rendered with:', { userId, profile, variant });
    const [code, setCode] = useState(null);
    const [loading, setLoading] = useState(false);

    const generateCode = async () => {
        setLoading(true);
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        try {
            // Save to Firestore 'linkCodes' collection
            await addDoc(collection(db, 'linkCodes'), {
                userId,
                code: newCode,
                createdAt: serverTimestamp()
            });
            setCode(newCode);
        } catch (e) {
            console.error(e);
            alert("コード発行に失敗しました");
        } finally {
            setLoading(false);
        }
    };

    if (variant === 'header') {
        if (profile?.lineUserId) {
            return (
                <div style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.5)', color: 'white', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontWeight: 'bold' }}>LINE済 ✅</span>
                </div>
            );
        }
        return (
            <div style={{ position: 'relative' }}>
                {!code ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); generateCode(); }}
                        disabled={loading}
                        style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.5)', color: 'white', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        {loading ? '発行中...' : 'LINE連携'}
                    </button>
                ) : (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '10px', background: 'white', padding: '10px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 50, minWidth: '150px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '5px' }}>LINEに送信:</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', fontFamily: 'monospace', color: '#2D3748', background: '#EDF2F7', padding: '4px', borderRadius: '4px' }}>
                            {code}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (profile?.lineUserId) {
        return (
            <div className="bg-emerald-900/30 border border-emerald-500/30 p-4 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#06C755] flex items-center justify-center text-white font-bold text-xl"></div>
                <div>
                    <h3 className="font-bold text-emerald-100">LINE連携済み</h3>
                    <p className="text-xs text-emerald-400">毎日の通知を受け取れます✅</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 border border-gray-700 p-4 rounded-xl">
            <h3 className="font-bold text-gray-200 mb-2 flex items-center gap-2">
                <span className="text-[#06C755]">●</span> LINE通知設定
            </h3>
            <p className="text-xs text-gray-400 mb-4">
                公式アカウントと連携すると、エレナからリアルタイムでアドバイスが届きます。
            </p>

            {!code ? (
                <button
                    onClick={generateCode}
                    disabled={loading}
                    className="w-full py-2 bg-[#06C755] hover:bg-[#05b34c] text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                    {loading ? '発行中...' : '連携コードを発行'}
                </button>
            ) : (
                <div className="text-center animate-in fade-in slide-in-from-bottom-2">
                    <p className="text-xs text-gray-400 mb-1">以下のコードをLINEに送ってください</p>
                    <div className="text-3xl font-mono font-bold text-white tracking-widest my-2 bg-black/30 py-2 rounded">
                        {code}
                    </div>
                </div>
            )}
        </div>
    );
}
