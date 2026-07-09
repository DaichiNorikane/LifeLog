import { generateElenaChatReply } from '@/app/actions/line-chat';
import {
    getLineChatContextAdmin,
    saveLineChatExchangeAdmin,
} from '@/lib/firebase/adminHelpers';
import { replyOrPushMessage } from '@/lib/line/client';
import { resolveUserOrReply } from '@/lib/line/resolveUser';

export const handleChatEvent = async (event, user = null, userText = event?.message?.text) => {
    const resolvedUser = user || await resolveUserOrReply(event);
    if (!resolvedUser) return null;

    const text = String(userText || '').trim();
    const context = await getLineChatContextAdmin(resolvedUser.uid, resolvedUser.data || {});
    const replyText = await generateElenaChatReply({
        ...context,
        userText: text,
    });

    await replyOrPushMessage(event, {
        type: 'text',
        text: replyText,
    });

    try {
        await saveLineChatExchangeAdmin(resolvedUser.uid, text, replyText);
    } catch (e) {
        console.warn("Line chat history save failed:", e.message);
    }

    return { replyText };
};
