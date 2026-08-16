#!/usr/bin/env node
/**
 * リッチメニューを LINE に登録する。
 *
 *   LINE_CHANNEL_ACCESS_TOKEN=xxxxx node scripts/create-richmenu.mjs
 *
 * 画像を指定しなければ public/richmenu.png（同梱の白背景）を使います。
 * 黒背景にするなら public/richmenu-dark.png を引数で渡してください。
 *
 * 必要な環境変数:
 *   LINE_CHANNEL_ACCESS_TOKEN … LINE Developers Console の Messaging API チャネルで発行
 *
 * 画像は 2500×1686 の PNG または JPEG（1MB以下）。
 *
 * 【注意】LINE公式アカウントマネージャーの画面からは、アルバム選択（cameraRoll）と
 * postback のアクションを設定できません。この2つを使うにはこのスクリプト
 * （Messaging API）が必要です。
 *
 * 既にリッチメニューが登録されている場合は、古いものを消してから登録し直します
 * （同じメニューが増え続けるのを避けるため）。
 */

import { readFile } from 'node:fs/promises';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const API = 'https://api.line.me/v2/bot';
const DATA_API = 'https://api-data.line.me/v2/bot';

// タップ領域。3列 × 3行（2500 × 1686）
// 上段=記録する（アルバム/履歴/レシピ）、中段=今日を知る、下段=ふりかえり
const RICH_MENU = {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'Lifelog main',
    chatBarText: 'エレナに相談する',
    areas: [
        // --- 上段: 記録する ---
        {
            bounds: { x: 0, y: 0, width: 833, height: 562 },
            action: { type: 'cameraRoll', label: 'アルバムから' },
        },
        {
            bounds: { x: 833, y: 0, width: 833, height: 562 },
            action: { type: 'postback', data: 'action=recent_meals', displayText: '履歴から記録したい' },
        },
        {
            bounds: { x: 1666, y: 0, width: 834, height: 562 },
            action: { type: 'postback', data: 'action=recipes', displayText: 'レシピから記録したい' },
        },
        // --- 中段: 今日を知る ---
        {
            bounds: { x: 0, y: 562, width: 833, height: 562 },
            action: { type: 'postback', data: 'action=suggest_meal', displayText: '何食べよう？' },
        },
        {
            bounds: { x: 833, y: 562, width: 833, height: 562 },
            action: { type: 'message', label: '今日のまとめ', text: 'サマリー' },
        },
        {
            bounds: { x: 1666, y: 562, width: 834, height: 562 },
            action: { type: 'message', label: '今日の総評', text: '今日の総評' },
        },
        // --- 下段: ふりかえり ---
        {
            bounds: { x: 0, y: 1124, width: 833, height: 562 },
            action: { type: 'message', label: 'からだ', text: 'からだ' },
        },
        {
            bounds: { x: 833, y: 1124, width: 833, height: 562 },
            action: { type: 'message', label: '目標', text: '目標' },
        },
        {
            bounds: { x: 1666, y: 1124, width: 834, height: 562 },
            action: { type: 'message', label: '週間レポート', text: '週間レポート' },
        },
    ],
};

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const request = async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`${options.method || 'GET'} ${url} -> ${response.status} ${body}`);
    }
    return response.status === 204 ? null : response.json().catch(() => null);
};

const main = async () => {
    const imagePath = process.argv[2] || 'public/richmenu.png';
    if (!TOKEN) {
        throw new Error(
            'LINE_CHANNEL_ACCESS_TOKEN が未設定です。\n'
            + '使い方: LINE_CHANNEL_ACCESS_TOKEN=xxxxx node scripts/create-richmenu.mjs',
        );
    }

    const image = await readFile(imagePath);
    const contentType = imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png';

    // 古いメニューを掃除してから作る
    const existing = await request(`${API}/richmenu/list`, { headers });
    for (const menu of existing?.richmenus || []) {
        await request(`${API}/richmenu/${menu.richMenuId}`, { method: 'DELETE', headers });
        console.log(`削除: ${menu.richMenuId} (${menu.name})`);
    }

    const created = await request(`${API}/richmenu`, {
        method: 'POST',
        headers,
        body: JSON.stringify(RICH_MENU),
    });
    const richMenuId = created.richMenuId;
    console.log(`作成: ${richMenuId}`);

    await request(`${DATA_API}/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': contentType },
        body: image,
    });
    console.log(`画像アップロード: ${imagePath}`);

    await request(`${API}/user/all/richmenu/${richMenuId}`, { method: 'POST', headers });
    console.log('全ユーザーの既定メニューに設定しました✅');
};

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
