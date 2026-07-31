/**
 * コンディションの短い通知文（エレナ口調・決定論）
 *
 * プッシュ通知は100文字程度しか読まれないので、AI に466文字を生成させて切り詰めるのは無駄。
 * ドライバーごとの定型文で十分に具体的なことが言える上、
 * ダッシュボードのカード表示と必ず一致する（AI が別のことを言い出さない）。
 *
 * AI（analyzeCondition）の出番は、腰を据えて読むモーダルの中だけに絞る。
 */

/** ドライバー別・今夜の行動提案。ここに無いドライバーは汎用文にフォールバックする */
const SLEEP_ACTIONS = {
    caffeine_late: '今夜はもうカフェインを控えましょう☕ 明日は14時までに切り上げるのがおすすめです！',
    late_meal: '今夜は就寝の3時間前までに食べ終えられると、眠りがぐっと深くなりますよ🌙',
    late_meal_fatty: '夜遅い脂っこい食事は消化に時間がかかります。今夜は軽めにしませんか？🥗',
    alcohol_moderate: 'お酒は寝つきは良くしますが、夜中に目が覚めやすくなります。お水も一緒にどうぞ💧',
    alcohol_heavy: 'その量は今夜の眠りをかなり削ります…😢 これ以上は止めておきましょう！',
    dinner_carb_excess: '夕食の炭水化物が多めでした。寝る前の間食は我慢しましょうね💪',
};

const FOCUS_ACTIONS = {
    breakfast_skipped: '明日は朝にタンパク質を20gだけ入れてみてください。午後の粘りが変わりますよ💪',
    lunch_carb_bomb: '炭水化物だけのお昼は午後に眠気がきます。明日はタンパク質を足しましょう🍗',
    lunch_heavy: 'お昼が重いと午後に消化へ血が回ります。明日は軽めにしてみませんか？',
    caffeine_excess: 'カフェインが多すぎます。かえって集中が切れやすくなりますよ⚠️',
    iron_low: '鉄が不足気味です。赤身肉や小松菜を足すと頭の回転が変わります🥩',
};

const GENERIC_SLEEP = '今夜は食事の時間と内容に少しだけ気をつけてみましょう🌙';

/** スコアがこれを下回ったら通知で触れる（それ以上なら黙っていた方が良い） */
export const NOTIFY_THRESHOLD = 55;

/**
 * 夜の通知に添える1行を作る。触れるべきことが無ければ null。
 * @param {object} result evaluateCondition() の戻り値
 */
export const buildEveningSleepNote = (result) => {
    const sleep = result?.axes?.sleep;
    if (!sleep || sleep.score === null || sleep.score === undefined) return null;
    if (sleep.confidence === 'insufficient' || sleep.confidence === 'low') return null;
    if (sleep.score >= NOTIFY_THRESHOLD) return null;

    // 最も減点の大きいドライバーを選ぶ（drivers は影響順に並んでいる）
    const worst = sleep.drivers.find(d => d.delta < 0);
    const action = (worst && SLEEP_ACTIONS[worst.key]) || GENERIC_SLEEP;

    return `【今夜の眠り ${sleep.score}点】${action}`;
};

/** 朝の通知に添える1行（集中力向け）。触れるべきことが無ければ null */
export const buildMorningFocusNote = (result) => {
    const focus = result?.axes?.focus;
    if (!focus || focus.score === null || focus.score === undefined) return null;
    if (focus.confidence === 'insufficient' || focus.confidence === 'low') return null;
    if (focus.score >= NOTIFY_THRESHOLD) return null;

    const worst = focus.drivers.find(d => d.delta < 0);
    if (!worst || !FOCUS_ACTIONS[worst.key]) return null;

    return `【集中力 ${focus.score}点】${FOCUS_ACTIONS[worst.key]}`;
};
