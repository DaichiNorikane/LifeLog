// ===========================
// Lifelog カロリーウィジェット for Scriptable
// ===========================
// 設定: 以下の2つを自分の値に書き換えてください
const CONFIG = {
    API_URL: "https://あなたのドメイン.vercel.app/api/widget/calories",
    WIDGET_TOKEN: "ここにWIDGET_TOKENを設定",
    USER_ID: "ここにFirebaseのUIDを設定",
};

// カラーパレット
const COLORS = {
    bg: new Color("#1a1a2e"),
    card: new Color("#16213e"),
    accent: new Color("#e94560"),
    green: new Color("#4ade80"),
    yellow: new Color("#fbbf24"),
    red: new Color("#ef4444"),
    text: new Color("#ffffff"),
    textSub: new Color("#94a3b8"),
    barBg: new Color("#334155"),
};

// エレナのステータス別メッセージ & 絵文字
const ELENA_MSG = {
    waiting: { emoji: "😴", msg: "まだ何も食べてないの？" },
    encourage: { emoji: "💪", msg: "いい感じ！この調子！" },
    normal: { emoji: "😊", msg: "順調だよ〜" },
    cheer: { emoji: "🎉", msg: "パーフェクト！" },
    logic: { emoji: "🤔", msg: "ちょっと食べすぎかも…" },
    scold: { emoji: "😤", msg: "食べすぎ注意！！" },
};

async function fetchData() {
    const url = `${CONFIG.API_URL}?uid=${CONFIG.USER_ID}`;
    const req = new Request(url);
    req.headers = { "x-widget-token": CONFIG.WIDGET_TOKEN };
    req.timeoutInterval = 10;
    try {
        return await req.loadJSON();
    } catch (e) {
        return null;
    }
}

function getCalorieColor(ratio) {
    if (ratio <= 80) return COLORS.green;
    if (ratio <= 105) return COLORS.yellow;
    return COLORS.red;
}

function createSmallWidget(data) {
    const w = new ListWidget();
    w.backgroundColor = COLORS.bg;
    w.setPadding(12, 14, 12, 14);

    if (!data || data.error) {
        const err = w.addText("⚠️ 取得失敗");
        err.font = Font.mediumSystemFont(14);
        err.textColor = COLORS.textSub;
        return w;
    }

    const elena = ELENA_MSG[data.elenaStatus] || ELENA_MSG.normal;

    // エレナ絵文字 + ステータス
    const header = w.addStack();
    header.layoutHorizontally();
    header.centerAlignContent();
    const emojiText = header.addText(elena.emoji);
    emojiText.font = Font.systemFont(20);
    header.addSpacer(6);
    const titleText = header.addText("Lifelog");
    titleText.font = Font.boldSystemFont(13);
    titleText.textColor = COLORS.textSub;

    w.addSpacer(6);

    // カロリー数値
    const calStack = w.addStack();
    calStack.layoutHorizontally();
    calStack.bottomAlignContent();
    const calText = calStack.addText(`${data.calories}`);
    calText.font = Font.boldMonospacedSystemFont(32);
    calText.textColor = getCalorieColor(data.ratio);
    calStack.addSpacer(3);
    const unitText = calStack.addText(`/ ${data.target}`);
    unitText.font = Font.systemFont(12);
    unitText.textColor = COLORS.textSub;

    w.addSpacer(4);

    // プログレスバー
    const barStack = w.addStack();
    barStack.layoutHorizontally();
    barStack.size = new Size(0, 6);
    barStack.cornerRadius = 3;
    barStack.backgroundColor = COLORS.barBg;
    const fillRatio = Math.min(data.ratio / 100, 1.2);
    const barFill = barStack.addStack();
    barFill.size = new Size(Math.max(fillRatio * 130, 2), 6);
    barFill.cornerRadius = 3;
    barFill.backgroundColor = getCalorieColor(data.ratio);

    w.addSpacer(6);

    // エレナメッセージ
    const msgText = w.addText(elena.msg);
    msgText.font = Font.mediumSystemFont(11);
    msgText.textColor = COLORS.text;
    msgText.lineLimit = 1;

    return w;
}

function createMediumWidget(data) {
    const w = new ListWidget();
    w.backgroundColor = COLORS.bg;
    w.setPadding(14, 16, 14, 16);

    if (!data || data.error) {
        const err = w.addText("⚠️ データ取得失敗");
        err.font = Font.mediumSystemFont(14);
        err.textColor = COLORS.textSub;
        return w;
    }

    const elena = ELENA_MSG[data.elenaStatus] || ELENA_MSG.normal;

    // ヘッダー行
    const header = w.addStack();
    header.layoutHorizontally();
    header.centerAlignContent();
    const emojiText = header.addText(elena.emoji);
    emojiText.font = Font.systemFont(22);
    header.addSpacer(6);
    const titleText = header.addText(`エレナ: ${elena.msg}`);
    titleText.font = Font.mediumSystemFont(13);
    titleText.textColor = COLORS.text;
    titleText.lineLimit = 1;
    header.addSpacer();
    const dateText = header.addText(data.date);
    dateText.font = Font.systemFont(11);
    dateText.textColor = COLORS.textSub;

    w.addSpacer(8);

    // メインコンテンツ
    const main = w.addStack();
    main.layoutHorizontally();

    // 左: カロリー
    const leftCol = main.addStack();
    leftCol.layoutVertically();
    const calText = leftCol.addText(`${data.calories}`);
    calText.font = Font.boldMonospacedSystemFont(36);
    calText.textColor = getCalorieColor(data.ratio);
    const targetText = leftCol.addText(`目標 ${data.target} kcal`);
    targetText.font = Font.systemFont(11);
    targetText.textColor = COLORS.textSub;

    leftCol.addSpacer(4);

    // プログレスバー
    const barStack = leftCol.addStack();
    barStack.layoutHorizontally();
    barStack.size = new Size(140, 6);
    barStack.cornerRadius = 3;
    barStack.backgroundColor = COLORS.barBg;
    const fillRatio = Math.min(data.ratio / 100, 1.2);
    const barFill = barStack.addStack();
    barFill.size = new Size(Math.max(fillRatio * 140, 2), 6);
    barFill.cornerRadius = 3;
    barFill.backgroundColor = getCalorieColor(data.ratio);

    main.addSpacer(16);

    // 右: PFCバランス
    const rightCol = main.addStack();
    rightCol.layoutVertically();

    const pfcItems = [
        { label: "P", value: data.protein, color: new Color("#60a5fa") },
        { label: "F", value: data.fat, color: new Color("#fb923c") },
        { label: "C", value: data.carbs, color: new Color("#a78bfa") },
    ];

    for (const item of pfcItems) {
        const row = rightCol.addStack();
        row.layoutHorizontally();
        row.centerAlignContent();
        const dot = row.addText("●");
        dot.font = Font.systemFont(8);
        dot.textColor = item.color;
        row.addSpacer(4);
        const label = row.addText(`${item.label}`);
        label.font = Font.boldMonospacedSystemFont(12);
        label.textColor = COLORS.textSub;
        row.addSpacer(4);
        const val = row.addText(`${item.value}g`);
        val.font = Font.monospacedSystemFont(14);
        val.textColor = COLORS.text;
        rightCol.addSpacer(2);
    }

    w.addSpacer(6);

    // フッター
    const footer = w.addStack();
    footer.layoutHorizontally();
    const remaining = footer.addText(
        data.remaining >= 0
            ? `あと ${data.remaining} kcal`
            : `${Math.abs(data.remaining)} kcal オーバー`
    );
    remaining.font = Font.boldSystemFont(12);
    remaining.textColor = data.remaining >= 0 ? COLORS.green : COLORS.red;
    footer.addSpacer();
    const meals = footer.addText(`${data.mealCount}食記録済み`);
    meals.font = Font.systemFont(11);
    meals.textColor = COLORS.textSub;

    return w;
}

// メイン実行
const data = await fetchData();
const widgetSize = config.widgetFamily || "small";

let widget;
if (widgetSize === "medium" || widgetSize === "large") {
    widget = createMediumWidget(data);
} else {
    widget = createSmallWidget(data);
}

// アプリタップ時にLifelogを開く
widget.url = CONFIG.API_URL.replace("/api/widget/calories", "");

if (config.runsInWidget) {
    Script.setWidget(widget);
} else {
    // Scriptableアプリ内でプレビュー
    if (widgetSize === "medium") {
        widget.presentMedium();
    } else {
        widget.presentSmall();
    }
}

Script.complete();
