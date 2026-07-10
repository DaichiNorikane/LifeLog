import { analyzeImageWithGemini } from '@/app/actions/image-analysis';
import { getMessageContentBase64, replyOrPushMessage } from '@/lib/line/client';
import { buildMealConfirmFlex } from '@/lib/line/flex/mealConfirm';
import { createSid, normalizeMealForLine } from '@/lib/line/mealUtils';
import { resolveUserOrReply } from '@/lib/line/resolveUser';
import { setLineState } from '@/lib/line/state';

export const handleMealPhotoEvent = async (event) => {
    const user = await resolveUserOrReply(event);
    if (!user) return;

    try {
        const base64Image = await getMessageContentBase64(event.message.id, 'image/jpeg');
        const analysis = await analyzeImageWithGemini(base64Image);
        if (analysis?.error) throw new Error(analysis.error);

        const meal = normalizeMealForLine(analysis);
        const sid = createSid();
        await setLineState(user.uid, { pendingMeal: meal, mode: null, sid });

        await replyOrPushMessage(event, buildMealConfirmFlex(meal, sid));
    } catch (e) {
        console.error("Meal photo flow failed:", e);
        await replyOrPushMessage(event, {
            type: 'text',
            text: 'ごめんなさい、写真の解析に失敗しちゃいました😢 もう一度送るか、食べたものを文字で教えてください！',
        });
    }
};
