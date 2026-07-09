import { messagingApi, validateSignature } from '@line/bot-sdk';

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

const getChannelAccessToken = () => process.env.LINE_CHANNEL_ACCESS_TOKEN;

export const getLineClient = () => {
    const channelAccessToken = getChannelAccessToken();
    if (!channelAccessToken) {
        console.error("LINE_CHANNEL_ACCESS_TOKEN is missing");
        return null;
    }
    return new MessagingApiClient({ channelAccessToken });
};

export const getLineBlobClient = () => {
    const channelAccessToken = getChannelAccessToken();
    if (!channelAccessToken) {
        console.error("LINE_CHANNEL_ACCESS_TOKEN is missing");
        return null;
    }
    return new MessagingApiBlobClient({ channelAccessToken });
};

const normalizeMessages = (messages) => Array.isArray(messages) ? messages : [messages];

export const pushMessage = async (userId, messages) => {
    const client = getLineClient();
    if (!client) return { error: "Client not initialized" };

    try {
        await client.pushMessage({
            to: userId,
            messages: normalizeMessages(messages)
        });
        return { success: true };
    } catch (e) {
        console.error("Failed to push message:", e);
        return { error: e.message };
    }
};

export const replyMessage = async (replyToken, messages) => {
    const client = getLineClient();
    if (!client) return { error: "Client not initialized" };

    try {
        await client.replyMessage({
            replyToken,
            messages: normalizeMessages(messages)
        });
        return { success: true };
    } catch (e) {
        console.error("Failed to reply message:", e);
        return { error: e.message };
    }
};

export const replyOrPushMessage = async (event, messages) => {
    if (event?.replyToken) {
        const replyResult = await replyMessage(event.replyToken, messages);
        if (replyResult?.success) return replyResult;
    }

    const lineUserId = event?.source?.userId;
    if (!lineUserId) return { error: "No replyToken or LINE user ID" };
    return pushMessage(lineUserId, messages);
};

export const showLoadingAnimation = async (lineUserId, loadingSeconds = 60) => {
    if (!lineUserId) return { error: "LINE user ID missing" };

    const client = getLineClient();
    const request = { chatId: lineUserId, loadingSeconds };

    try {
        if (client?.showLoadingAnimation) {
            await client.showLoadingAnimation(request);
            return { success: true };
        }

        const token = getChannelAccessToken();
        if (!token || typeof fetch !== 'function') return { error: "Loading API unavailable" };

        const res = await fetch('https://api.line.me/v2/bot/chat/loading/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(request),
        });
        if (!res.ok) return { error: `Loading API failed: ${res.status}` };
        return { success: true };
    } catch (e) {
        console.warn("Failed to show LINE loading animation:", e.message);
        return { error: e.message };
    }
};

const streamToBuffer = async (content) => {
    if (Buffer.isBuffer(content)) return content;
    if (content?.arrayBuffer) return Buffer.from(await content.arrayBuffer());

    const chunks = [];
    for await (const chunk of content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
};

export const getMessageContentBuffer = async (messageId) => {
    const client = getLineBlobClient();
    if (!client) throw new Error("LINE blob client not initialized");
    const content = await client.getMessageContent(messageId);
    return streamToBuffer(content);
};

export const getMessageContentBase64 = async (messageId, mimeType = 'image/jpeg') => {
    const buffer = await getMessageContentBuffer(messageId);
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
};

export { validateSignature };
