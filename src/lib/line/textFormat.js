/**
 * エレナの長文（Gemini生成）の整形。
 *
 * モデルは改行をほとんど入れずに返してくることがあり、LINEの吹き出しでは
 * 数百文字がベタっと繋がって読みにくい。そこで表示直前に、
 * 文末（。！？）とそれに続く絵文字・閉じ括弧の直後で改行を入れる。
 *
 * 保存（チャット履歴・daily_evaluations）には元のテキストをそのまま使い、
 * 整形は表示するときだけ行う（整形ルールを変えたときに過去データへ波及させないため）。
 */

// 文末: 。！？(全角/半角)の連続 + それに続く絵文字・記号・閉じ括弧
// 「頑張って！」のような台詞の途中で切らないよう、閉じ括弧類は文末側に含める。
// 先読みは「通常の文字」だけに限定する。[^\n] にすると、文末絵文字で終わる文で
// バックトラックが起きて「！」と絵文字の間に改行が入ってしまう
const SENTENCE_END_RE = /([。！？!?]+[\p{Extended_Pictographic}\u{FE0F}\u{200D}♪♡☆」』）)\]】]*)(?=[^\n。！？!?\p{Extended_Pictographic}\u{FE0F}\u{200D}♪♡☆」』）)\]】])/gu;

export const formatElenaText = (text) => {
    const value = String(text ?? '');
    if (!value) return value;

    return value
        .replace(SENTENCE_END_RE, '$1\n')
        // 元から改行があった場合に3連以上の空行にならないよう詰める
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd();
};
