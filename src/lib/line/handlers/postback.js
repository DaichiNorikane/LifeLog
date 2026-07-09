import { evaluateSingleMeal } from '@/app/actions/daily-evaluation';
import {
    addMealAdmin,
    deleteMealsAdmin,
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
    text: 'そのカードは期限切れみたい💦 もう一度送ってね！',
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
        return `${nameText}、記録から消しといたよ🗑 これでスッキリ！`;
    }
    if (pendingEdit.operation === 'change_type') {
        return `${count}件、${MEAL_TYPE_LABELS[pendingEdit.mealType] || '食事'}に変えたよ✨ Web側の集計にも反映されるからね！`;
    }
    return '変更したよ✨';
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
                text: 'そのままにしておくね👌',
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
                text: 'ごめん、うまく変更できなかった😢',
            });
        }
        return;
    }

    const state = await getValidMealStateForPostback(user.uid, sid);
    if (!state) {
        await replyOrPushMessage(event, EXPIRED_CARD_MESSAGE);
        return;
    }

    if (action === 'set_type') {
        if (!MEAL_TYPE_LABELS[type]) {
            await replyOrPushMessage(event, EXPIRED_CARD_MESSAGE);
            return;
        }
        const updatedMeal = {
            ...state.pendingMeal,
            mealType: type,
        };
        await setLineState(user.uid, {
            pendingMeal: updatedMeal,
            mode: state.mode,
            sid: state.sid,
        });
        await replyOrPushMessage(event, buildMealConfirmFlex(updatedMeal, state.sid));
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
            text: 'どこを直す？そのまま送って！\n例: 「ご飯半分」「ドレッシングなし」「卵を追加」✏️',
        });
        return;
    }

    if (action === 'cancel_meal') {
        await clearLineState(user.uid);
        await replyOrPushMessage(event, {
            type: 'text',
            text: '記録はやめておいたよ。迷ったらまた写真か食べたものを送ってね📷',
        });
        return;
    }

    if (action !== 'save_meal') {
        await replyOrPushMessage(event, EXPIRED_CARD_MESSAGE);
        return;
    }

    const meal = {
        ...state.pendingMeal,
        timestamp: new Date().toISOString(),
        image: null,
    };

    try {
        await addMealAdmin(user.uid, meal);
        await clearLineState(user.uid);
    } catch (e) {
        console.error("Meal save failed:", e);
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめん、保存に失敗しちゃった😢 少し時間を置いてもう一度試して！',
        });
        return;
    }

    try {
        const evaluation = await evaluateSingleMeal(meal);
        if (!evaluation?.error && evaluation?.score != null && evaluation?.reason) {
            await replyOrPushMessage(event, buildMealSavedFlex(meal, evaluation));
            return;
        }
    } catch (e) {
        console.warn("Single meal evaluation failed:", e.message);
    }

    await replyOrPushMessage(event, {
        type: 'text',
        text: '記録したよ✅',
    });
};
