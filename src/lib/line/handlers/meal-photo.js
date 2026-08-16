import { analyzeImageWithGemini } from '@/app/actions/image-analysis';
import { getMessageContentBase64, replyOrPushMessage } from '@/lib/line/client';
import { buildMealConfirmFlex } from '@/lib/line/flex/mealConfirm';
import { createSid, normalizeMealForLine, parseMealTypeHint } from '@/lib/line/mealUtils';
import { resolveUserOrReply } from '@/lib/line/resolveUser';
import { clearLineState, getAwaitingPhotoContextState, setLineState } from '@/lib/line/state';

/**
 * 写真からの記録。
 *
 * LINEは写真にキャプションを付けられないため、「これを昼に食べた」のような補足は
 * 写真とは別のテキストとして届く。先に届いた補足は state に保持しておき（router 側）、
 * 写真が来たらここで合体させて解析する。
 * 補足に「昼」などの時間帯が含まれていれば、確認カードの食事タイプにも反映する。
 */
export const handleMealPhotoEvent = async (event) => {
    const user = await resolveUserOrReply(event);
    if (!user) return;

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
