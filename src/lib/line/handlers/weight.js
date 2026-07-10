import { addWeightAdmin, getLatestWeightBefore } from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { resolveUserOrReply } from '@/lib/line/resolveUser';

export const WEIGHT_TEXT_RE = /^(体重)?\s*\d{2,3}(\.\d+)?\s*(kg)?$/;

export const parseWeightText = (text) => {
    const trimmed = String(text || '').trim();
    if (!WEIGHT_TEXT_RE.test(trimmed)) return null;
    const match = trimmed.match(/\d{2,3}(?:\.\d+)?/);
    if (!match) return null;
    const weight = Number(match[0]);
    if (Number.isNaN(weight) || weight < 20 || weight > 200) return null;
    return weight;
};

const formatDelta = (delta) => {
    const fixed = Math.abs(delta).toFixed(1);
    if (delta < 0) return `前日比 -${fixed}kg！いい流れです、ちゃんと数字に出ていますよ🔥`;
    if (delta > 0) return `前日比 +${fixed}kg。水分や塩分でも動きますから、焦らず今日で整えましょう💪`;
    return '前日比 ±0.0kg。キープも立派なデータです✨';
};

export const handleWeightEvent = async (event, text = event.message?.text) => {
    const weight = parseWeightText(text);
    if (weight === null) return false;

    const user = await resolveUserOrReply(event);
    if (!user) return true;

    const saved = await addWeightAdmin(user.uid, weight, new Date());
    const previous = await getLatestWeightBefore(user.uid, saved.date).catch(() => null);
    const deltaComment = previous?.weight != null
        ? formatDelta(weight - Number(previous.weight))
        : '初回の体重記録、受け取りました！ここから一緒に見ていきましょうね🎯';

    const target = user.data?.targetWeight ? `\n目標まであと${(weight - Number(user.data.targetWeight)).toFixed(1)}kg。数字は嘘をつきませんから、淡々と積み上げましょう！` : '';

    await replyOrPushMessage(event, {
        type: 'text',
        text: `${weight.toFixed(1)}kgで記録しました✅\n${deltaComment}${target}`,
    });
    return true;
};
