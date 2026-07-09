import { findUserByLineId } from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';

export const LINK_REQUIRED_MESSAGE = {
    type: 'text',
    text: 'まずはアカウント連携をお願いします！\nアプリで発行した「6桁の数字」を送ってくださいね。',
};

export const resolveUser = async (lineUserId) => findUserByLineId(lineUserId);

export const resolveUserOrReply = async (event) => {
    const user = await resolveUser(event?.source?.userId);
    if (user) return user;
    await replyOrPushMessage(event, LINK_REQUIRED_MESSAGE);
    return null;
};
