import { analyzeImageWithGemini } from '@/app/actions/image-analysis';
import { getMessageContentBase64, replyOrPushMessage } from '@/lib/line/client';
import { buildMealConfirmFlex, buildMealSetConfirmFlex } from '@/lib/line/flex/mealConfirm';
import { createSid, normalizeMealForLine, parseMealTypeHint } from '@/lib/line/mealUtils';
import { resolveUserOrReply } from '@/lib/line/resolveUser';
import {
    addPhotoSetItem, clearLineState, getAwaitingPhotoContextState, setLineState,
} from '@/lib/line/state';

/**
 * 写真からの記録。
 *
 * LINEは写真にキャプションを付けられないため、「これを昼に食べた」のような補足は
 * 写真とは別のテキストとして届く。先に届いた補足は state に保持しておき（router 側）、
 * 写真が来たらここで合体させて解析する。
 * 補足に「昼」などの時間帯が含まれていれば、確認カードの食事タイプにも反映する。
 */
/** 同時に送られた複数枚の写真なら imageSet の情報を返す（1枚だけなら null） */
export const getImageSet = (event) => {
    const imageSet = event?.message?.imageSet;
    const total = Number(imageSet?.total);
    if (!imageSet?.id || !Number.isFinite(total) || total < 2) return null;
    return { setId: imageSet.id, index: Number(imageSet.index) || 0, total };
};

export const handleMealPhotoEvent = async (event) => {
    const user = await resolveUserOrReply(event);
    if (!user) return;

    const imageSet = getImageSet(event);
    if (imageSet) return handleMealPhotoSetEvent(event, user, imageSet);

    try {
        // 直前に補足テキストが届いていれば写真と合体させる（使ったら消す）
        const contextState = await getAwaitingPhotoContextState(user.uid);
        const context = contextState?.contextText || '';
        if (contextState?.sid) {
            await clearLineState(user.uid, contextState.sid);
        }

        const base64Image = await getMessageContentBase64(event.message.id, 'image/jpeg');
        const analysis = await analyzeImageWithGemini(base64Image, context);
        if (analysis?.error) throw new Error(analysis.error);

        // 「昼に食べた」なら昼食を選択済みにする。ヒントがなければ従来通り時間帯から推定
        const mealTypeHint = parseMealTypeHint(context);
        const meal = normalizeMealForLine(analysis, mealTypeHint ? { mealType: mealTypeHint } : {});
        const sid = createSid();
        await setLineState(user.uid, { pendingMeal: meal, mode: null, sid });

        await replyOrPushMessage(event, buildMealConfirmFlex(meal, sid));
        return { context: context || null, mealType: meal.mealType };
    } catch (e) {
        console.error("Meal photo flow failed:", e);
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめんなさい、写真の解析に失敗しちゃいました😢 もう一度送るか、食べたものを文字で教えてください！',
        });
    }
};

/**
 * 複数枚まとめて送られた写真の1枚。
 *
 * 1枚ずつ確認カードを返すと、1枚目を保存した時点で「それしか食べていない」前提の評価になる。
 * そこで全枚数の解析が揃うまで返信せずに溜め、最後の1枚でまとめの確認カードを1枚だけ返す。
 * 補足テキストは全ての写真に効かせたいので、ここでは消さずに最後の1枚で消す。
 */
const handleMealPhotoSetEvent = async (event, user, imageSet) => {
    const contextState = await getAwaitingPhotoContextState(user.uid).catch(() => null);
    const context = contextState?.contextText || '';
    const mealTypeHint = parseMealTypeHint(context);

    let meal = null;
    try {
        const base64Image = await getMessageContentBase64(event.message.id, 'image/jpeg');
        const analysis = await analyzeImageWithGemini(base64Image, context);
        if (analysis?.error) throw new Error(analysis.error);
        meal = normalizeMealForLine(analysis, mealTypeHint ? { mealType: mealTypeHint } : {});
    } catch (e) {
        // 失敗した写真も「解析済み（null）」として登録しないと、残りの写真が永遠に待ち続ける
        console.error("Meal photo (set) analysis failed:", e);
    }

    try {
        const { complete, meals } = await addPhotoSetItem(user.uid, { ...imageSet, meal });
        if (!complete) return { waiting: true, index: imageSet.index };

        if (contextState?.sid) await clearLineState(user.uid, contextState.sid).catch(() => {});

        if (meals.length === 0) {
            await replyOrPushMessage(event, {
                type: 'text',
                text: 'ごめんなさい、写真の解析に失敗しちゃいました😢 もう一度送るか、食べたものを文字で教えてください！',
            });
            return { context: context || null, count: 0 };
        }

        // 同じ食事なので食事タイプは揃える（1枚目の推定＝時間帯 or 補足に合わせる）
        const mealType = meals[0].mealType;
        const aligned = meals.map(item => ({ ...item, mealType }));
        const failedCount = imageSet.total - aligned.length;
        const sid = createSid();

        const messages = [];
        if (aligned.length === 1) {
            await setLineState(user.uid, { pendingMeal: aligned[0], mode: null, sid });
            messages.push(buildMealConfirmFlex(aligned[0], sid));
        } else {
            await setLineState(user.uid, { pendingMeals: aligned, mode: null, sid });
            messages.push(buildMealSetConfirmFlex(aligned, sid));
        }
        if (failedCount > 0) {
            messages.push({
                type: 'text',
                text: `${failedCount}枚は解析できませんでした😢 足りない分は写真を送り直すか、文字で教えてくださいね！`,
            });
        }
        await replyOrPushMessage(event, messages.length === 1 ? messages[0] : messages);
        return { context: context || null, mealType, count: aligned.length };
    } catch (e) {
        console.error("Meal photo set flow failed:", e);
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめんなさい、写真の解析に失敗しちゃいました😢 もう一度送るか、食べたものを文字で教えてください！',
        });
    }
};

/**
 * 写真より先に補足テキストが届いたとき（router の photo_context ルートから呼ばれる）。
 * 次の写真が来るまで覚えておく。
 */
export const handlePhotoContextStash = async (event, user, text) => {
    await setLineState(user.uid, {
        sid: `photo-context-${Date.now()}`,
        mode: 'awaiting_photo_context',
        contextText: text,
    });

    await replyOrPushMessage(event, {
        type: 'text',
        text: 'メモしました📝 写真を送ってくれたら、その内容も込みで解析しますね📷',
    });
    return { stashed: true };
};
