import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getLineClient } from '@/lib/line';

export async function POST(request) {
    try {
        const { userId, evaluation } = await request.json();

        if (!userId || !evaluation) {
            return NextResponse.json({ error: 'Missing userId or evaluation data' }, { status: 400 });
        }

        // 1. Get user's lineUserId
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const lineUserId = userDoc.data().lineUserId;
        if (!lineUserId) {
            return NextResponse.json({ error: 'LINE not linked' }, { status: 400 });
        }

        // 2. Format Message
        const messagingApi = getLineClient();

        // Construct text from evaluation result
        const dateStr = new Date().toLocaleDateString('ja-JP');
        const score = evaluation.score;
        const title = evaluation.title;
        const advice = evaluation.advice || ''; // Advice might be in evaluation object or separate? Assumed in 'advice' or 'reason'

        // Note: EvaluationModal result object structure: { score, title, reason, characterStatus, ... }
        // Let's assume 'reason' is the main text.

        const text = `
【${dateStr}の評価結果】
スコア: ${score}点
判定: ${title}

${evaluation.reason || evaluation.advice}

(アプリから手動送信)
        `.trim();

        // 3. Push Message
        await messagingApi.pushMessage({
            to: lineUserId,
            messages: [{ type: 'text', text: text }]
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[ManualPush] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
