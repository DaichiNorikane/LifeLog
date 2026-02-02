import { messagingApi, webhook } from '@line/bot-sdk';

const { MessagingApiClient } = messagingApi;

// Note: Ensure process.env.LINE_CHANNEL_ACCESS_TOKEN and process.env.LINE_CHANNEL_SECRET are set

export const getLineClient = () => {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) {
        console.error("LINE_CHANNEL_ACCESS_TOKEN is missing");
        return null;
    }
    return new MessagingApiClient({
        channelAccessToken: channelAccessToken,
    });
};

export const pushMessage = async (userId, messages) => {
    const client = getLineClient();
    if (!client) return { error: "Client not initialized" };

    try {
        await client.pushMessage({
            to: userId,
            messages: Array.isArray(messages) ? messages : [messages]
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
            replyToken: replyToken,
            messages: Array.isArray(messages) ? messages : [messages]
        });
        return { success: true };
    } catch (e) {
        console.error("Failed to reply message:", e);
        return { error: e.message };
    }
};

// Helper to validate signature
export const validateSignature = (body, signature, channelSecret) => {
    if (!channelSecret) return false;
    return webhook.validateSignature(body, channelSecret, signature);
};
