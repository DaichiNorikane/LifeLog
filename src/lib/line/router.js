import { FieldValue } from 'firebase-admin/firestore';
import { classifyLineIntent } from '@/app/actions/line-intent';
import { db } from '@/lib/firebase/admin';
import { replyOrPushMessage, showLoadingAnimation } from '@/lib/line/client';
import { handleFollowEvent, handleLinkCodeEvent } from '@/lib/line/handlers/link';
import { handleKeywordSuggestEvent, MEAL_KEYWORDS } from '@/lib/line/handlers/keyword-suggest';
import { handleMealCorrectionEvent, handleMealTextEvent } from '@/lib/line/handlers/meal-text';
import { handleMealPhotoEvent } from '@/lib/line/handlers/meal-photo';
import { handlePostbackEvent } from '@/lib/line/handlers/postback';
import { handleWeightEvent, parseWeightText } from '@/lib/line/handlers/weight';
import { resolveUserOrReply } from '@/lib/line/resolveUser';
import { getActiveLineState } from '@/lib/line/state';

export const OTHER_INTENT_MESSAGE = {
    type: 'text',
    text: 'ごめん、まだおしゃべりは練習中なの😢 食べたものを送ってくれたら記録するよ！「カレー食べた」とか、写真でもOK📷',
};

const isAlreadyExistsError = (error) => {
    const code = String(error?.code || error?.details || '').toLowerCase();
    return code.includes('already') || code === '6';
};

export const getEventDedupeId = (event) => event?.webhookEventId || event?.message?.id || null;

export const markEventProcessed = async (event) => {
    const id = getEventDedupeId(event);
    if (!id) return true;

    try {
        await db.collection('webhookEvents').doc(id).create({
            createdAt: FieldValue.serverTimestamp(),
        });
        return true;
    } catch (e) {
        if (isAlreadyExistsError(e)) return false;
        console.warn("Webhook dedupe write failed; continuing:", e.message);
        return true;
    }
};

export const classifyTextRoute = (text, state = null) => {
    const trimmed = String(text || '').trim();
    if (/^\d{6}$/.test(trimmed)) return { type: 'link_code', code: trimmed };

    const weight = parseWeightText(trimmed);
    if (weight !== null) return { type: 'weight', weight };

    if (MEAL_KEYWORDS[trimmed]) return { type: 'keyword', targetType: MEAL_KEYWORDS[trimmed] };
    if (state?.mode === 'awaiting_correction') return { type: 'correction' };
    return { type: 'intent' };
};

export const classifyEventRoute = (event, state = null) => {
    if (event?.type === 'postback') return { type: 'postback' };
    if (event?.type === 'follow') return { type: 'follow' };
    if (event?.type === 'message' && event.message?.type === 'image') return { type: 'image' };
    if (event?.type === 'message' && event.message?.type === 'text') {
        return classifyTextRoute(event.message.text, state);
    }
    return { type: 'ignore' };
};

export const handleLineEvent = async (event) => {
    const shouldProcess = await markEventProcessed(event);
    if (!shouldProcess) return { skipped: true, reason: 'duplicate' };

    if (event?.source?.userId) {
        await showLoadingAnimation(event.source.userId, 60);
    }

    const immediateRoute = classifyEventRoute(event);
    if (immediateRoute.type === 'follow') {
        await handleFollowEvent(event);
        return { handled: 'follow' };
    }
    if (immediateRoute.type === 'postback') {
        await handlePostbackEvent(event);
        return { handled: 'postback' };
    }
    if (immediateRoute.type === 'image') {
        await handleMealPhotoEvent(event);
        return { handled: 'image' };
    }
    if (event?.type !== 'message' || event.message?.type !== 'text') {
        return { ignored: true };
    }

    const text = event.message.text.trim();
    const route = classifyTextRoute(text);

    if (route.type === 'link_code') {
        await handleLinkCodeEvent(event, route.code);
        return { handled: 'link_code' };
    }
    if (route.type === 'weight') {
        await handleWeightEvent(event, text);
        return { handled: 'weight' };
    }
    if (route.type === 'keyword') {
        await handleKeywordSuggestEvent(event, route.targetType);
        return { handled: 'keyword' };
    }

    const user = await resolveUserOrReply(event);
    if (!user) return { handled: 'link_required' };

    const state = await getActiveLineState(user.uid);
    const stateAwareRoute = classifyTextRoute(text, state);
    if (stateAwareRoute.type === 'correction') {
        await handleMealCorrectionEvent(event, user, state, text);
        return { handled: 'correction' };
    }

    const intent = await classifyLineIntent(text);
    if (intent.intent === 'log_meal') {
        await handleMealTextEvent(event, user, intent.mealDescription || text);
        return { handled: 'meal_text' };
    }

    await replyOrPushMessage(event, OTHER_INTENT_MESSAGE);
    return { handled: 'other' };
};

export const handleLineEvents = async (events = []) => {
    const results = [];
    for (const event of events) {
        results.push(await handleLineEvent(event));
    }
    return results;
};
