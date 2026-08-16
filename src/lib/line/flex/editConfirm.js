import { MEAL_TYPE_LABELS } from '@/lib/line/mealUtils';

const postbackData = (action, sid) => new URLSearchParams({ action, sid }).toString();

const operationLabel = (operation, mealType) => {
    if (operation === 'delete') return '削除する';
    if (operation === 'change_type') return `${MEAL_TYPE_LABELS[mealType] || '食事'}に変更`;
    return '変更する';
};

export const buildEditConfirmFlex = (plan, sid) => {
    const isDelete = plan.operation === 'delete';
    const targetNames = plan.targetNames || [];
    return {
        type: 'flex',
        altText: isDelete ? '食事記録を削除しますか？' : '食事記録を変更しますか？',
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: isDelete ? '#B91C1C' : '#111827',
                paddingAll: '16px',
                contents: [
                    {
                        type: 'text',
                        text: isDelete ? '本当に削除しますか？' : 'この変更でいいですか？',
                        color: '#FFFFFF',
                        weight: 'bold',
                        size: 'lg',
                    },
                    {
                        type: 'text',
                        text: isDelete ? '消した記録は戻せないので注意してくださいね⚠️' : '保存済みの食事タイプを更新しますね✨',
                        color: '#FEE2E2',
                        size: 'sm',
                        margin: 'sm',
                        wrap: true,
                    },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'text',
                        text: plan.confirmText || operationLabel(plan.operation, plan.mealType),
                        weight: 'bold',
                        size: 'md',
                        wrap: true,
                    },
                    {
                        type: 'text',
                        text: `対象: ${targetNames.length}件`,
                        color: '#6B7280',
                        size: 'sm',
                    },
                    {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'xs',
                        contents: targetNames.slice(0, 10).map(name => ({
                            type: 'text',
                            text: `・${name}`,
                            size: 'sm',
                            wrap: true,
                            color: '#374151',
                        })),
                    },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: isDelete ? '#B91C1C' : '#10B981',
                        action: {
                            type: 'postback',
                            label: '✅ 実行する',
                            data: postbackData('apply_edit', sid),
                            displayText: '実行する',
                        },
                    },
                    {
                        type: 'button',
                        style: 'link',
                        action: {
                            type: 'postback',
                            label: '❌ やめる',
                            data: postbackData('cancel_edit', sid),
                            displayText: 'やめる',
                        },
                    },
                ],
            },
        },
    };
};
