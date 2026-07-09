import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase/admin';
import { replyOrPushMessage } from '@/lib/line/client';

export const handleFollowEvent = async (event) => {
    await replyOrPushMessage(event, {
        type: 'text',
        text: '友だち追加ありがとうございます！🎉\nLifelogアプリで発行した「6桁の数字」を送って、アカウントを連携してくださいね！',
    });
};

export const linkUserAccount = async (code, lineUserId) => {
    try {
        const snapshot = await db.collection('linkCodes').where('code', '==', code).limit(1).get();
        if (snapshot.empty) return { success: false };

        const docSnap = snapshot.docs[0];
        const appUserId = docSnap.data().userId;

        await db.collection('users').doc(appUserId).update({
            lineUserId,
            lineLinkedAt: FieldValue.serverTimestamp(),
        });
        await docSnap.ref.delete();

        return { success: true, uid: appUserId };
    } catch (e) {
        console.error("Link Error:", e);
        return { success: false };
    }
};

export const handleLinkCodeEvent = async (event, code) => {
    const result = await linkUserAccount(code, event.source?.userId);
    if (result.success) {
        await replyOrPushMessage(event, {
            type: 'text',
            text: '連携しました！\nこんにちは、エレナです✨\nこれから毎日サポートしますね！💪',
        });
        return;
    }

    await replyOrPushMessage(event, {
        type: 'text',
        text: 'コードが見つからないか、有効期限切れです...😢\nアプリで新しいコードを発行してください。',
    });
};
