import { FieldValue } from 'firebase-admin/firestore';
import { classifyLineIntent } from '@/app/actions/line-intent';
import { db } from '@/lib/firebase/admin';
import { showLoadingAnimation } from '@/lib/line/client';
import { handleChatEvent } from '@/lib/line/handlers/chat';
import { handleDailySummaryEvent, isDailySummaryText } from '@/lib/line/handlers/daily-summary';
import { handleFollowEvent, handleLinkCodeEvent } from '@/lib/line/handlers/link';
import { handleBodyEvent, isBodyText } from '@/lib/line/handlers/body';
import { handleGoalEvent, parseGoalCommand } from '@/lib/line/handlers/goal';
import {
    handleRecentMealsEvent, handleRecentSearchInput, parseRecentMealsQuery,
} from '@/lib/line/handlers/recent-meals';
import { handleKeywordSuggestEvent, MEAL_KEYWORDS } from '@/lib/line/handlers/keyword-suggest';
import { handleMealEditEvent } from '@/lib/line/handlers/meal-edit';
import { handleMealCorrectionEvent, handleMealTextEvent } from '@/lib/line/handlers/meal-text';
import { handleMealPhotoEvent } from '@/lib/line/handlers/meal-photo';
import { handlePostbackEvent } from '@/lib/line/handlers/postback';
import { handleWeightEvent, parseWeightText } from '@/lib/line/handlers/weight';
import { resolveUserOrReply } from '@/lib/line/resolveUser';
import { getAwaitingCorrectionState, getAwaitingRecentSearchState } from '@/lib/line/state';

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

    const goal = parseGoalCommand(trimmed);
    if (goal) return { type: 'goal', goal };

    const weight = parseWeightText(trimmed);
    if (weight !== null) return { type: 'weight', weight };

    if (MEAL_KEYWORDS[trimmed]) return { type: 'keyword', targetType: MEAL_KEYWORDS[trimmed] };
    if (isDailySummaryText(trimmed)) return { type: 'summary' };
    if (isBodyText(trimmed)) return { type: 'body' };
    // 「履歴」だけでも「履歴 唐揚げ」でも拾う（query は空文字なら絞り込みなし）
    const recentQuery = parseRecentMealsQuery(trimmed);
    if (recentQuery !== null) return { type: 'recent_meals', query: recentQuery };
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

    if (route.type === 'summary') {
        await handleDailySummaryEvent(event, user);
        return { handled: 'summary' };
    }
    if (route.type === 'goal') {
        await handleGoalEvent(event, user, route.goal);
        return { handled: 'goal' };
    }
    if (route.type === 'body') {
        await handleBodyEvent(event, user);
        return { handled: 'body' };
    }
    if (route.type === 'recent_meals') {
        await handleRecentMealsEvent(event, user, { query: route.query });
        return { handled: 'recent_meals' };
    }

    const state = await getAwaitingCorrectionState(user.uid);
    const stateAwareRoute = classifyTextRoute(text, state);
    if (stateAwareRoute.type === 'correction') {
        await handleMealCorrectionEvent(event, user, state, text);
        return { handled: 'correction' };
    }

    // 「キーワードで探す」の直後なら、この発話は検索語として扱う。
    // 食事の記録として解釈されてしまうのを防ぐため、intent 判定より先に見る
    const searchState = await getAwaitingRecentSearchState(user.uid);
    if (searchState) {
        await handleRecentSearchInput(event, user, searchState, text);
        return { handled: 'recent_meals_search' };
    }

    const intent = await classifyLineIntent(text);
    if (intent.intent === 'log_meal') {
        await handleMealTextEvent(event, user, intent.mealDescription || text);
        return { handled: 'meal_text' };
    }
    if (intent.intent === 'edit_record') {
        await handleMealEditEvent(event, user, text);
        return { handled: 'meal_edit' };
    }

    await handleChatEvent(event, user, text);
    return { handled: 'chat' };
};

// 複数の写真・メッセージが同時に届いても並列で処理する（各イベントは独立したカードになる）
// 1件の失敗が他のイベントを巻き込まないよう、エラーはイベント単位で握りつぶす
export const handleLineEvents = async (events = []) => Promise.all(
    events.map(event => handleLineEvent(event).catch(e => {
        console.error("LINE event handling failed:", e);
        return { error: e.message };
    })),
);
