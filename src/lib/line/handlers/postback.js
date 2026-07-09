import { evaluateSingleMeal } from '@/app/actions/daily-evaluation';
import { addMealAdmin } from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { buildMealSavedFlex } from '@/lib/line/flex/mealSaved';
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
    };
};

const getValidStateForPostback = async (uid, sid) => {
    const state = await getActiveLineState(uid);
    if (!state?.sid || state.sid !== sid || !state.pendingMeal) return null;
    return state;
};

export const handlePostbackEvent = async (event) => {
    const user = await resolveUserOrReply(event);
    if (!user) return;

    const { action, sid } = parsePostbackData(event.postback?.data);
    const state = await getValidStateForPostback(user.uid, sid);
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
