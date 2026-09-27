import { replyWithSavedMeal, replyWithSavedMeals } from '@/lib/line/mealSavedReply';
import {
    addMealAdmin,
    deleteMealsAdmin,
    updateMealsTypeAdmin,
} from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { buildMealConfirmCarousels } from '@/lib/line/flex/mealConfirm';
import { createSid, MEAL_TYPE_LABELS } from '@/lib/line/mealUtils';
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
        offset: params.get('offset'),  // 履歴・レシピの続きを見るときの開始位置
        q: params.get('q'),            // 履歴の絞り込みキーワード
        rid: params.get('rid'),        // レシピから登録するときのレシピID
        cat: params.get('cat'),        // レシピのカテゴリ絞り込み（'none'=未分類）
    };
};

const getValidMealStateForPostback = async (uid, sid) => {
    const state = await getLineStateBySid(uid, sid);
    if (!state?.pendingMeal && !state?.pendingMeals?.length) return null;
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

    const { action, sid, type, mid, offset, q, rid, cat } = parsePostbackData(event.postback?.data);

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

    // リッチメニューの「レシピ登録」。保存済みレシピを一覧で出す
    // offset と cat が付いていれば、続きの表示・カテゴリ絞り込みになる
    if (action === 'recipes') {
        const { handleRecipesEvent } = await import('@/lib/line/handlers/recipes');
        await handleRecipesEvent(event, user, { offset, category: cat });
        return;
    }

    // 「カテゴリで絞る」。レシピがあるカテゴリの一覧を出す
    if (action === 'recipe_cats') {
        const { handleRecipeCategoriesEvent } = await import('@/lib/line/handlers/recipes');
        await handleRecipeCategoriesEvent(event, user);
        return;
    }

    // レシピ一覧の「これを記録」。type が無ければ食事タイプを選ぶカードが返る
    if (action === 'log_recipe') {
        const { handleLogRecipe } = await import('@/lib/line/handlers/recipes');
        await handleLogRecipe(event, user, rid, type);
        return;
    }

    // レシピのタイプ選択カードの「やめる」
    if (action === 'cancel_recipe') {
        await replyOrPushMessage(event, {
            type: 'text',
            text: '記録はやめておきました👌 また「レシピ」から呼んでくださいね！',
        });
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

    // 複数写真のまとめカード。全品を同じタイプで保存し、合計で1回だけ評価する
    if (action === 'save_meals' || action === 'split_meals') {
        if (!state.pendingMeals?.length) {
            await replyOrPushMessage(event, EXPIRED_CARD_MESSAGE);
            return;
        }

        if (action === 'split_meals') {
            // 従来の1品ずつのカードに分ける。1品だけ違う・直したいとき用
            const entries = state.pendingMeals.map(meal => ({ meal, sid: createSid() }));
            await Promise.all(entries.map(entry =>
                setLineState(user.uid, { pendingMeal: entry.meal, mode: null, sid: entry.sid })));
            await clearLineState(user.uid, sid);
            await replyOrPushMessage(event, buildMealConfirmCarousels(entries));
            return;
        }

        const timestamp = new Date().toISOString();
        const meals = state.pendingMeals.map(pendingMeal => ({
            ...pendingMeal,
            ...(MEAL_TYPE_LABELS[type] ? { mealType: type } : {}),
            timestamp,
            image: null,
        }));
        try {
            // 二重タップで全品が重複保存されないよう、保存より先にカードを消費する
            await clearLineState(user.uid, sid);
            for (const meal of meals) {
                meal.id = await addMealAdmin(user.uid, meal);
            }
        } catch (e) {
            console.error("Meal set save failed:", e);
            const savedCount = meals.filter(meal => meal.id).length;
            // 1品も保存できていなければカードを復活させ、同じボタンで再試行できるようにする
            if (savedCount === 0) {
                await setLineState(user.uid, { pendingMeals: state.pendingMeals, mode: null, sid }).catch(() => {});
            }
            await replyOrPushMessage(event, {
                type: 'text',
                text: savedCount > 0
                    ? `ごめんなさい、${meals.length}品中${savedCount}品までしか保存できませんでした😢 残りは写真か文字でもう一度送ってください！`
                    : 'ごめんなさい、保存に失敗しちゃいました😢 少し時間を置いてもう一度試してください！',
            });
            return;
        }

        await replyWithSavedMeals(event, user, meals, { flex: true });
        return;
    }

    if (!state.pendingMeal && action !== 'cancel_meal') {
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

    await replyWithSavedMeal(event, user, meal, { flex: true });
};
