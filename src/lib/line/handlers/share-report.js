import { replyOrPushMessage } from '@/lib/line/client';

/**
 * 「LINE共有用に出力」— アプリ内の同名ボタンと同じ内容を LINE に送る。
 *
 * 送るのは、項目と数値だけの共有テキスト + 体重・体脂肪率の推移グラフ（PNG）。
 * そのまま家族やグループのトークに転送できるよう、エレナの口調は使わない。
 * 定期送信はせず、ユーザーが押したときだけ返す。
 */

export const SHARE_REPORT_RE = /^(LINE|ＬＩＮＥ)?共有(用)?(に出力|を出力|出力)?$/i;

export const isShareReportText = (text) => SHARE_REPORT_RE.test(String(text || '').trim());

/** 「からだ」「今日のまとめ」の返信に付けるクイックリプライ */
export const SHARE_REPORT_QUICK_REPLY = {
    items: [{
        type: 'action',
        action: {
            type: 'postback',
            label: 'LINE共有用に出力',
            data: 'action=share_report',
            displayText: 'LINE共有用に出力',
        },
    }],
};

export const withShareQuickReply = (message) => ({ ...message, quickReply: SHARE_REPORT_QUICK_REPLY });

export const handleShareReportEvent = async (event, user, { now = new Date() } = {}) => {
    // 動的 import。「からだ」「今日のまとめ」はクイックリプライのためにこのファイルを読むので、
    // Firestore や署名の依存をその起動パスに載せない
    const [{ buildShareTextAdmin }, { createShareChartUrl }] = await Promise.all([
        import('@/lib/share/shareReportAdmin'),
        import('@/lib/share/shareToken'),
    ]);
    const { text, hasTrend } = await buildShareTextAdmin(user.uid, user.data || {}, now);
    const messages = [{ type: 'text', text }];

    // 画像は署名付き URL を LINE に取りに来てもらう。秘密鍵や公開 URL が
    // 未設定の環境ではテキストだけ返す（ボタンが無反応になるよりよい）
    const chartUrl = hasTrend ? createShareChartUrl(user.uid, { now: now.getTime() }) : null;
    if (chartUrl) {
        messages.push({ type: 'image', originalContentUrl: chartUrl, previewImageUrl: chartUrl });
    }

    await replyOrPushMessage(event, messages);
    return { image: Boolean(chartUrl) };
};
