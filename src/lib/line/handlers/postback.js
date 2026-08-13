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
import { clearLineState, getLineStateBySid, setLineState } from '@/lib/line/state';

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
        mid: params.get('mid'),        // 履歴から登録するときの元の食事ID
        offset: params.get('offset'),  // 履歴の続きを見るときの開始位置
        q: params.get('q'),            // 履歴の絞り込みキーワード
    };
};

const getValidMealStateForPostback = async (uid, sid) => {
    const state = await getLineStateBySid(uid, sid);
    if (!state?.pendingMeal) return null;
    return state;
};

const getValidEditStateForPostback = async (uid, sid) => {
    const state = await getLineStateBySid(uid, sid);
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

/** いまの時刻から、次に食べる食事を選ぶ（リッチメニューの「何食べる？」用） */
export const pickMealSlotByHour = (date = new Date()) => {
    const jstHour = Number(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false,
    }).format(date));

    if (jstHour < 10) return 'breakfast';
    if (jstHour < 15) return 'lunch';
    return 'dinner';
};

export const handlePostbackEvent = async (event) => {
    const user = await resolveUserOrReply(event);
    if (!user) return;

    const { action, sid, type, mid, offset, q } = parsePostbackData(event.postback?.data);

    // リッチメニューの「何食べる？」。時間帯から朝/昼/夕を選んで既存の提案を出す
    if (action === 'suggest_meal') {
        // 動的 import。ここでしか使わない依存を postback の起動パスに載せない
        const { handleKeywordSuggestEvent } = await import('@/lib/line/handlers/keyword-suggest');
        await handleKeywordSuggestEvent(event, pickMealSlotByHour());
        return;
    }

    // リッチメニューの「履歴から」。過去に記録したものを一覧で出す
    // offset と q が付いていれば、続きの表示・キーワード絞り込みになる
    if (action === 'recent_meals') {
        const { handleRecentMealsEvent } = await import('@/lib/line/handlers/recent-meals');
        await handleRecentMealsEvent(event, user, { offset, query: q });
        return;
    }

    // 「キーワードで探す」。次の発話を検索語として受け取る
    if (action === 'recent_search') {
        const { handleRecentSearchPrompt } = await import('@/lib/line/handlers/recent-meals');
        await handleRecentSearchPrompt(event, user);
        return;
    }

    // 一覧の「これを記録」を押したとき。
    // type が付いていなければ、朝食/昼食/夕食/間食を選ぶカードが返る
    if (action === 'log_recent') {
        const { handleLogRecentMeal } = await import('@/lib/line/handlers/recent-meals');
        await handleLogRecentMeal(event, user, mid, type);
        return;
    }

    // タイプ選択カードの「やめる」。まだ何も保存していないので消すものはない
    if (action === 'cancel_recent') {
        await replyOrPushMessage(event, {
            type: 'text',
            text: '記録はやめておきました👌 また「履歴」から呼んでくださいね！',
        });
        return;
    }

    if (action === 'apply_edit' || action === 'cancel_edit') {
        const editState = await getValidEditStateForPostback(user.uid, sid);
        if (!editState) {
            await replyOrPushMessage(event, EXPIRED_CARD_MESSAGE);
            return;
        }

        if (action === 'cancel_edit') {
            await clearLineState(user.uid, sid);
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
            await clearLineState(user.uid, sid);
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
        await clearLineState(user.uid, sid);
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
        await clearLineState(user.uid, sid);
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
