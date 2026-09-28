/**
 * プロジェクターシミュレーター用のプリセット定義
 *
 * ここに載せている数値は「機種カテゴリごとの一般的な目安」です。
 * 実機の値はメーカーの仕様書（スローレシオ・レンズシフト範囲・明るさ）と
 * 必ず照合し、必要に応じて「カスタム」で直接入力してください。
 *
 * shift の単位は utils/projector.js の定義に準拠:
 *   v: 画面の高さに対する上下シフト量(%)、+で画面が上に上がる
 *   h: 画面の幅に対する左右シフト量(%)
 */

export const ASPECT_RATIOS = [
  { id: '16:9', label: '16:9（フルHD/4K）', value: 16 / 9 },
  { id: '16:10', label: '16:10（WUXGA）', value: 16 / 10 },
  { id: '4:3', label: '4:3（XGA）', value: 4 / 3 },
  { id: '2.35:1', label: '2.35:1（シネスコ）', value: 2.35 },
  { id: '1:1', label: '1:1（正方形）', value: 1 },
];

export const RESOLUTIONS = [
  { id: '4k', label: '4K UHD (3840×2160)', hPixels: 3840, vPixels: 2160 },
  { id: 'wuxga', label: 'WUXGA (1920×1200)', hPixels: 1920, vPixels: 1200 },
  { id: 'fhd', label: 'フルHD (1920×1080)', hPixels: 1920, vPixels: 1080 },
  { id: 'wxga', label: 'WXGA (1280×800)', hPixels: 1280, vPixels: 800 },
  { id: 'xga', label: 'XGA (1024×768)', hPixels: 1024, vPixels: 768 },
];

export const SCREEN_GAINS = [
  { id: 'matt', label: 'マットホワイト（標準）', value: 1.0 },
  { id: 'beads', label: 'ビーズ（高輝度）', value: 1.5 },
  { id: 'gray', label: 'グレー（黒浮き対策）', value: 0.8 },
  { id: 'alr', label: 'ALR（環境光対策）', value: 1.2 },
  { id: 'wall', label: '白い壁に直接投写', value: 0.7 },
];

/**
 * 機種カテゴリ。
 * lenses が複数あるものは交換レンズ機として扱う。
 */
export const PROJECTOR_TYPES = [
  {
    id: 'home-standard',
    label: '家庭用スタンダード',
    description: 'リビング設置の定番。ズームとレンズシフトに余裕がある',
    lumens: 2500,
    resolution: '4k',
    shift: { vMin: -15, vMax: 90, hMin: -25, hMax: 25 },
    lenses: [{ id: 'std', label: '標準ズーム', throwRatioMin: 1.35, throwRatioMax: 2.2 }],
  },
  {
    id: 'home-entry',
    label: 'エントリー/モバイル',
    description: '小型・低価格帯。オフセット固定でシフト調整はできないことが多い',
    lumens: 700,
    resolution: 'fhd',
    shift: { vMin: 50, vMax: 50, hMin: 0, hMax: 0 },
    lenses: [{ id: 'fixed', label: '単焦点（固定）', throwRatioMin: 1.2, throwRatioMax: 1.3 }],
  },
  {
    id: 'home-short',
    label: '短焦点',
    description: '狭い部屋向け。近い距離で大画面が得られる',
    lumens: 3000,
    resolution: 'fhd',
    shift: { vMin: 30, vMax: 30, hMin: 0, hMax: 0 },
    lenses: [{ id: 'short', label: '短焦点ズーム', throwRatioMin: 0.75, throwRatioMax: 1.0 }],
  },
  {
    id: 'ust',
    label: '超短焦点（レーザーTV）',
    description: '壁際の台に置いて使うタイプ。設置位置のシビアさが特徴',
    lumens: 2500,
    resolution: '4k',
    shift: { vMin: 60, vMax: 60, hMin: 0, hMax: 0 },
    lenses: [{ id: 'ust', label: '超短焦点（固定）', throwRatioMin: 0.25, throwRatioMax: 0.25 }],
  },
  {
    id: 'business',
    label: 'ビジネス/教室用',
    description: '会議室・教室の常設向け。明るさ重視',
    lumens: 3500,
    resolution: 'wuxga',
    shift: { vMin: 55, vMax: 55, hMin: 0, hMax: 0 },
    lenses: [{ id: 'std', label: '標準ズーム', throwRatioMin: 1.4, throwRatioMax: 2.3 }],
  },
  {
    id: 'installation',
    label: '設置用（交換レンズ）',
    description: 'ホール・イベント向けの大型機。レンズを選んで距離を合わせる',
    lumens: 7000,
    resolution: 'wuxga',
    shift: { vMin: -60, vMax: 60, hMin: -30, hMax: 30 },
    lenses: [
      { id: 'ust', label: '超短焦点レンズ', throwRatioMin: 0.36, throwRatioMax: 0.36 },
      { id: 'short-zoom', label: '短焦点ズーム', throwRatioMin: 0.75, throwRatioMax: 0.95 },
      { id: 'standard-zoom', label: '標準ズーム', throwRatioMin: 1.3, throwRatioMax: 1.9 },
      { id: 'middle-zoom', label: '中望遠ズーム', throwRatioMin: 1.9, throwRatioMax: 3.0 },
      { id: 'tele-zoom', label: '望遠ズーム', throwRatioMin: 3.0, throwRatioMax: 5.2 },
      { id: 'long-tele', label: '超望遠ズーム', throwRatioMin: 5.2, throwRatioMax: 8.5 },
    ],
  },
  {
    id: 'custom',
    label: 'カスタム（実機の仕様を入力）',
    description: '取扱説明書のスローレシオとシフト範囲を直接入力する',
    lumens: 2000,
    resolution: 'fhd',
    shift: { vMin: 0, vMax: 60, hMin: -10, hMax: 10 },
    lenses: [{ id: 'custom', label: 'カスタムレンズ', throwRatioMin: 1.2, throwRatioMax: 1.6 }],
  },
];

export const getProjectorType = (id) =>
  PROJECTOR_TYPES.find((t) => t.id === id) || PROJECTOR_TYPES[0];

export const getLens = (type, lensId) => {
  const t = getProjectorType(typeof type === 'string' ? type : type?.id);
  return t.lenses.find((l) => l.id === lensId) || t.lenses[0];
};

export const getAspect = (id) =>
  ASPECT_RATIOS.find((a) => a.id === id) || ASPECT_RATIOS[0];

export const getResolution = (id) =>
  RESOLUTIONS.find((r) => r.id === id) || RESOLUTIONS[0];

export const getScreenGain = (id) =>
  SCREEN_GAINS.find((g) => g.id === id) || SCREEN_GAINS[0];

export const MOUNTINGS = [
  { id: 'floor', label: '床/台に設置', description: 'テーブルや棚の上に正立で置く' },
  { id: 'ceiling', label: '天吊り', description: '天井金具で上下反転して吊る' },
];
