#!/usr/bin/env node
/**
 * リッチメニュー画像（2500×1686 / 3列×3行）を生成する。
 *
 *   node scripts/generate-richmenu-image.mjs            # public/richmenu.png（白背景）
 *   node scripts/generate-richmenu-image.mjs --dark     # public/richmenu-dark.png（黒背景）
 *
 * セルの並びは scripts/create-richmenu.mjs のタップ領域と対応させること。
 * 日本語フォント（Noto Sans CJK JP など）と絵文字フォントがインストールされた環境で実行する。
 * 生成後は create-richmenu.mjs で LINE にアップロードする（1MB以下であること）。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const DARK = process.argv.includes('--dark');

const WIDTH = 2500;
const HEIGHT = 1686;
const COLS = 3;
const ROWS = 3;
const CELL_W = WIDTH / COLS;   // 833.33
const CELL_H = HEIGHT / ROWS;  // 562

// create-richmenu.mjs の areas と同じ並び（左上→右下）
// アイコンは絵文字ではなくベクターで描く（実行環境の絵文字フォント差で崩れないように）
const CELLS = [
    { icon: 'camera', label: 'アルバムから', sub: '写真で記録' },
    { icon: 'clock', label: '履歴から', sub: 'いつものを記録' },
    { icon: 'book', label: 'レシピ登録', sub: '定番メニューを記録' },
    { icon: 'bulb', label: '何食べる？', sub: 'エレナの提案' },
    { icon: 'chart', label: '今日のまとめ', sub: 'カロリーと栄養' },
    { icon: 'star', label: '今日の総評', sub: 'エレナの採点' },
    { icon: 'heart', label: 'からだ', sub: '歩数・睡眠・体組成' },
    { icon: 'target', label: '目標', sub: '確認と変更' },
    { icon: 'trend', label: '週間レポート', sub: '1週間のふりかえり' },
];

const theme = DARK
    ? {
        background: '#111827',
        cardFill: '#1F2937',
        cardStroke: '#374151',
        label: '#F9FAFB',
        sub: '#9CA3AF',
        accent: '#34D399',
    }
    : {
        background: '#F5F7FA',
        cardFill: '#FFFFFF',
        cardStroke: '#E5E7EB',
        label: '#111827',
        sub: '#6B7280',
        accent: '#10B981',
    };

const PADDING = 22;

// (cx, cy) を中心に一辺 s の枠へ収まるラインアイコンを描く
const ICONS = {
    camera: (cx, cy, s, c) => `
        <rect x="${cx - s / 2}" y="${cy - s * 0.32}" width="${s}" height="${s * 0.68}" rx="${s * 0.1}" fill="none" stroke="${c}" stroke-width="12" />
        <path d="M ${cx - s * 0.2} ${cy - s * 0.32} L ${cx - s * 0.12} ${cy - s * 0.46} L ${cx + s * 0.12} ${cy - s * 0.46} L ${cx + s * 0.2} ${cy - s * 0.32}" fill="none" stroke="${c}" stroke-width="12" stroke-linejoin="round" />
        <circle cx="${cx}" cy="${cy + s * 0.02}" r="${s * 0.2}" fill="none" stroke="${c}" stroke-width="12" />`,
    clock: (cx, cy, s, c) => `
        <circle cx="${cx}" cy="${cy}" r="${s / 2}" fill="none" stroke="${c}" stroke-width="12" />
        <path d="M ${cx} ${cy - s * 0.28} L ${cx} ${cy} L ${cx + s * 0.2} ${cy + s * 0.12}" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />`,
    book: (cx, cy, s, c) => `
        <path d="M ${cx} ${cy - s * 0.35} C ${cx - s * 0.15} ${cy - s * 0.48} ${cx - s * 0.42} ${cy - s * 0.45} ${cx - s * 0.5} ${cy - s * 0.38} L ${cx - s * 0.5} ${cy + s * 0.35} C ${cx - s * 0.42} ${cy + s * 0.28} ${cx - s * 0.15} ${cy + s * 0.25} ${cx} ${cy + s * 0.38} C ${cx + s * 0.15} ${cy + s * 0.25} ${cx + s * 0.42} ${cy + s * 0.28} ${cx + s * 0.5} ${cy + s * 0.35} L ${cx + s * 0.5} ${cy - s * 0.38} C ${cx + s * 0.42} ${cy - s * 0.45} ${cx + s * 0.15} ${cy - s * 0.48} ${cx} ${cy - s * 0.35} Z" fill="none" stroke="${c}" stroke-width="12" stroke-linejoin="round" />
        <line x1="${cx}" y1="${cy - s * 0.35}" x2="${cx}" y2="${cy + s * 0.38}" stroke="${c}" stroke-width="12" />`,
    bulb: (cx, cy, s, c) => `
        <path d="M ${cx - s * 0.32} ${cy - s * 0.08} A ${s * 0.32} ${s * 0.32} 0 1 1 ${cx + s * 0.32} ${cy - s * 0.08} C ${cx + s * 0.32} ${cy + s * 0.1} ${cx + s * 0.14} ${cy + s * 0.12} ${cx + s * 0.14} ${cy + s * 0.26} L ${cx - s * 0.14} ${cy + s * 0.26} C ${cx - s * 0.14} ${cy + s * 0.12} ${cx - s * 0.32} ${cy + s * 0.1} ${cx - s * 0.32} ${cy - s * 0.08} Z" fill="none" stroke="${c}" stroke-width="12" stroke-linejoin="round" />
        <line x1="${cx - s * 0.12}" y1="${cy + s * 0.4}" x2="${cx + s * 0.12}" y2="${cy + s * 0.4}" stroke="${c}" stroke-width="12" stroke-linecap="round" />
        <line x1="${cx - s * 0.09}" y1="${cy + s * 0.52}" x2="${cx + s * 0.09}" y2="${cy + s * 0.52}" stroke="${c}" stroke-width="12" stroke-linecap="round" />`,
    chart: (cx, cy, s, c) => `
        <line x1="${cx - s * 0.5}" y1="${cy + s * 0.45}" x2="${cx + s * 0.5}" y2="${cy + s * 0.45}" stroke="${c}" stroke-width="12" stroke-linecap="round" />
        <rect x="${cx - s * 0.38}" y="${cy + s * 0.05}" width="${s * 0.18}" height="${s * 0.32}" rx="6" fill="${c}" />
        <rect x="${cx - s * 0.09}" y="${cy - s * 0.25}" width="${s * 0.18}" height="${s * 0.62}" rx="6" fill="${c}" />
        <rect x="${cx + s * 0.2}" y="${cy - s * 0.45}" width="${s * 0.18}" height="${s * 0.82}" rx="6" fill="${c}" />`,
    star: (cx, cy, s, c) => {
        const points = [];
        for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? s * 0.55 : s * 0.24;
            const angle = -Math.PI / 2 + (i * Math.PI) / 5;
            points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
        }
        return `<polygon points="${points.join(' ')}" fill="none" stroke="${c}" stroke-width="12" stroke-linejoin="round" />`;
    },
    heart: (cx, cy, s, c) => `
        <path d="M ${cx} ${cy + s * 0.4} C ${cx - s * 0.55} ${cy + s * 0.05} ${cx - s * 0.5} ${cy - s * 0.45} ${cx - s * 0.05} ${cy - s * 0.22} L ${cx} ${cy - s * 0.16} L ${cx + s * 0.05} ${cy - s * 0.22} C ${cx + s * 0.5} ${cy - s * 0.45} ${cx + s * 0.55} ${cy + s * 0.05} ${cx} ${cy + s * 0.4} Z" fill="none" stroke="${c}" stroke-width="12" stroke-linejoin="round" />`,
    target: (cx, cy, s, c) => `
        <circle cx="${cx}" cy="${cy}" r="${s * 0.5}" fill="none" stroke="${c}" stroke-width="12" />
        <circle cx="${cx}" cy="${cy}" r="${s * 0.3}" fill="none" stroke="${c}" stroke-width="12" />
        <circle cx="${cx}" cy="${cy}" r="${s * 0.1}" fill="${c}" />`,
    trend: (cx, cy, s, c) => `
        <polyline points="${cx - s * 0.5},${cy + s * 0.35} ${cx - s * 0.15},${cy - s * 0.05} ${cx + s * 0.08},${cy + s * 0.15} ${cx + s * 0.5},${cy - s * 0.35}" fill="none" stroke="${c}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
        <polyline points="${cx + s * 0.24},${cy - s * 0.35} ${cx + s * 0.5},${cy - s * 0.35} ${cx + s * 0.5},${cy - s * 0.09}" fill="none" stroke="${c}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />`,
};

const buildCell = (cell, index) => {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const x = col * CELL_W + PADDING;
    const y = row * CELL_H + PADDING;
    const w = CELL_W - PADDING * 2;
    const h = CELL_H - PADDING * 2;
    const centerX = x + w / 2;

    return `
    <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28"
            fill="${theme.cardFill}" stroke="${theme.cardStroke}" stroke-width="4" />
        <rect x="${x}" y="${y + h - 12}" width="${w}" height="12" rx="6" fill="${theme.accent}" opacity="0.85" />
        ${ICONS[cell.icon](centerX, y + 155, 160, theme.accent)}
        <text x="${centerX}" y="${y + 370}" font-size="92" font-weight="bold" text-anchor="middle"
            fill="${theme.label}" font-family="Noto Sans CJK JP, Noto Sans JP, sans-serif">${cell.label}</text>
        <text x="${centerX}" y="${y + 460}" font-size="52" text-anchor="middle"
            fill="${theme.sub}" font-family="Noto Sans CJK JP, Noto Sans JP, sans-serif">${cell.sub}</text>
    </g>`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${theme.background}" />
    ${CELLS.map(buildCell).join('\n')}
</svg>`;

const main = async () => {
    const outPath = DARK ? 'public/richmenu-dark.png' : 'public/richmenu.png';
    await mkdir('public', { recursive: true });

    const png = await sharp(Buffer.from(svg), { density: 72 })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();

    if (png.length > 1024 * 1024) {
        throw new Error(`画像が1MBを超えています (${Math.round(png.length / 1024)}KB)。LINEにアップロードできません。`);
    }

    await writeFile(outPath, png);
    console.log(`生成: ${outPath} (${Math.round(png.length / 1024)}KB)`);
};

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
