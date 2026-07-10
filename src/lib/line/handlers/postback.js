import { evaluateSingleMeal } from '@/app/actions/daily-evaluation';
import {
    addMealAdmin,
    deleteMealsAdmin,
    getLineChatContextAdmin,
    saveLineChatExchangeAdmin,
    updateMealsTypeAdmin,
} from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { buildMealConfirmFlex } from '@/lib/line/flex/mealConfirm';
import { buildMealSavedFlex } from '@/lib/line/flex/mealSaved';
import { MEAL_TYPE_LABELS } from '@/lib/line/mealUtils';
import { resolveUserOrReply } from '@/lib/line/resolveUser';
import { clearLineState, getActiveLineState, setLineState } from '@/lib/line/state';

export const EXPIRED_CARD_MESSAGE = {
    type: 'text',
    text: 'そのカードは期限切れみたいです💦 もう一度送ってくださいね！',
};

export const parsePostbackData = (data) => {
    const params = new URLSearchParams(data || '');
    return {
        action: params.get('action'),
        sid: params.get('sid'),
        type: params.get('type'),
    };
};

const getStateForSid = async (uid, sid) => {
    const state = await getActiveLineState(uid);
    if (!state?.sid || state.sid !== sid) return null;
    return state;
};

const getValidMealStateForPostback = async (uid, sid) => {
    const state = await getStateForSid(uid, sid);
    if (!state?.pendingMeal) return null;
    return state;
};

const getValidEditStateForPostback = async (uid, sid) => {
    const state = await getStateForSid(uid, sid);
    if (!state?.pendingEdit) return null;
    return state;
};

const editSuccessText = (pendingEdit) => {
    const count = pendingEdit.targetIds?.length || 0;
    if (pendingEdit.operation === 'delete') {
        const nameText = (pendingEdit.targetNames || []).join('、') || '対象の記録';
        return `${nameText}、記録から消しておきました🗑 これでスッキリですね！`;
    }
    if (pendingEdit.operation === 'change_type') {
        return `${count}件、${MEAL_TYPE_LABELS[pendingEdit.mealType] || '食事'}に変えました✨ Web側の集計にも反映されますからね！`;
    }
    return '変更しました✨';
};

export const handlePostbackEvent = async (event) => {
    const user = await resolveUserOrReply(event);
    if (!user) return;

    const { action, sid, type } = parsePostbackData(event.postback?.data);

    if (action === 'apply_edit' || action === 'cancel_edit') {
        const editState = await getValidEditStateForPostback(user.uid, sid);
        if (!editState) {
            await replyOrPushMessage(event, EXPIRED_CARD_MESSAGE);
            return;
        }

        if (action === 'cancel_edit') {
            await clearLineState(user.uid);
            await replyOrPushMessage(event, {
                type: 'text',
                text: 'そのままにしておきますね👌',
            });
            return;
        }

        try {
            const edit = editState.pendingEdit;
            if (edit.operation === 'delete') {
                await deleteMealsAdmin(user.uid, edit.targetIds || []);
            } else if (edit.operation === 'change_type') {
                await updateMealsTypeAdmin(user.uid, edit.targetIds || [], edit.mealType);
            } else {
                throw new Error(`Unsupported edit operation: ${edit.operation}`);
            }
            await clearLineState(user.uid);
            await replyOrPushMessage(event, {
                type: 'text',
                text: editSuccessText(edit),
            });
        } catch (e) {
            console.error("Meal edit apply failed:", e);
            await replyOrPushMessage(event, {
                type: 'text',
                text: 'ごめんなさい、うまく変更できませんでした😢',
            });
        }
        return;
    }

    const state = await getValidMealStateForPostback(user.uid, sid);
    if (!state) {
        await replyOrPushMessage(event, EXPIRED_CARD_MESSAGE);
        return;
    }

    if (action === 'edit_meal') {
        await setLineState(user.uid, {
            pendingMeal: state.pendingMeal,
            mode: 'awaiting_correction',
            sid: state.sid,
        });
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'どこを直しますか？そのまま送ってください！\n例: 「ご飯半分」「ドレッシングなし」「卵を追加」✏️',
        });
        return;
    }

    if (action === 'cancel_meal') {
        await clearLineState(user.uid);
        await replyOrPushMessage(event, {
            type: 'text',
            text: '記録はやめておきました。迷ったらまた写真か食べたものを送ってくださいね📷',
        });
        return;
    }

    // 'set_type' はデプロイ前に送信済みの旧カード用（現在はタイプボタンも即保存）
    if (action !== 'save_meal' && action !== 'set_type') {
        await replyOrPushMessage(event, EXPIRED_CARD_MESSAGE);
        return;
    }

    const meal = {
        ...state.pendingMeal,
        ...(MEAL_TYPE_LABELS[type] ? { mealType: type } : {}),
        timestamp: new Date().toISOString(),
        image: null,
    };

    try {
        meal.id = await addMealAdmin(user.uid, meal);
        await clearLineState(user.uid);
    } catch (e) {
        console.error("Meal save failed:", e);
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめんなさい、保存に失敗しちゃいました😢 少し時間を置いてもう一度試してください！',
        });
        return;
    }

    const mealTypeLabel = MEAL_TYPE_LABELS[meal.mealType] || '食事';
    let replyText = `${mealTypeLabel}に記録しました✅`;

    try {
        const context = await getLineChatContextAdmin(user.uid, user.data || {});
        const evaluation = await evaluateSingleMeal(meal, context.today?.meals || [], {
            messageHistory: context.messageHistory || [],
        });
        if (!evaluation?.error && evaluation?.score != null && evaluation?.reason) {
            await replyOrPushMessage(event, buildMealSavedFlex(meal, evaluation));
            replyText = evaluation.reason;
            await saveMealExchangeToHistory(user.uid, meal, mealTypeLabel, replyText);
            return;
        }
    } catch (e) {
        console.warn("Single meal evaluation failed:", e.message);
    }

    await replyOrPushMessage(event, {
        type: 'text',
        text: replyText,
    });
    await saveMealExchangeToHistory(user.uid, meal, mealTypeLabel, replyText);
};

// 記録イベントをチャット履歴に残し、以降の自由チャットが記録の文脈を把握できるようにする
const saveMealExchangeToHistory = async (uid, meal, mealTypeLabel, assistantText) => {
    try {
        await saveLineChatExchangeAdmin(
            uid,
            `（食事を記録: ${meal.foodName} ${meal.calories}kcal / ${mealTypeLabel}）`,
            assistantText,
        );
    } catch (e) {
        console.warn("Meal exchange history save failed:", e.message);
    }
};
