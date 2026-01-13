"use client";
import { useState } from 'react';
import { X, Plus, Trash2, Refrigerator } from 'lucide-react';

export default function StockManager({ isOpen, onClose, stockItems, onAdd, onDelete }) {
    const [newItemName, setNewItemName] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    if (!isOpen) return null;

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newItemName.trim()) return;
        setIsAdding(true);
        try {
            await onAdd({ name: newItemName.trim(), type: 'general' });
            setNewItemName('');
        } catch (e) {
            console.error(e);
            alert("追加に失敗しました");
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="fixed-overlay" style={{ zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-panel zoom-in" style={{ width: '90%', maxWidth: '400px', padding: '0', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>

                {/* Header */}
                <div style={{ padding: '15px 20px', background: 'linear-gradient(135deg, #FF9966 0%, #FF5E62 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: '20px', borderTopRightRadius: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Refrigerator size={20} /> 食材・食事環境メモ
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white' }}><X /></button>
                </div>

                {/* Content */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                        冷蔵庫の食材や、今の状況（場所・外食の予定など）を入力してください。AIがそれを考慮して提案します。
                    </p>

                    {/* Add Form */}
                    <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                        <input
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder="例: キャベツ, 新宿駅周辺, 居酒屋..."
                            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.5)' }}
                        />
                        <button type="submit" disabled={isAdding || !newItemName.trim()} className="btn-primary" style={{ padding: '0 15px', background: '#FF5E62' }}>
                            <Plus size={20} />
                        </button>
                    </form>

                    {/* List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {stockItems.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', background: 'var(--bg-main)', borderRadius: '10px' }}>
                                リストは空です。<br />食材や場所などを追加してください。
                            </div>
                        ) : (
                            stockItems.map(item => (
                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'white', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                                    <button onClick={() => onDelete(item.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
