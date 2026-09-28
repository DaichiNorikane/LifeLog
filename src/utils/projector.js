/**
 * プロジェクター投写シミュレーションの計算ロジック（純粋関数のみ）
 *
 * 単位の統一ルール:
 *   - 長さ: メートル (m)
 *   - 画面サイズ: 対角インチ (inch)
 *   - 角度: 度 (deg)
 *   - 明るさ: ルーメン (lm) / ルクス (lx) / フットランバート (fL)
 *
 * レンズシフト量の定義（本アプリ共通）:
 *   shift(%) = (画面中心の高さ − レンズ中心の高さ) / 画面の高さ × 100
 *   - 0%   … レンズの正面に画面の中心が来る
 *   - +50% … 画面の下端がレンズと同じ高さ（画面はすべてレンズより上）
 *   - -50% … 画面の上端がレンズと同じ高さ（画面はすべてレンズより下）
 *   水平シフトも同様に「画面の幅」に対する割合で表す。
 */

export const INCH_TO_M = 0.0254;
/** 1 fL = 3.4263 cd/m^2 */
export const CD_PER_FL = 3.4262591;
export const RAD_TO_DEG = 180 / Math.PI;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const safe = (v, fallback = 0) => (isFiniteNumber(v) ? v : fallback);

/* ------------------------------------------------------------------ */
/* 画面サイズ                                                          */
/* ------------------------------------------------------------------ */

/** 対角インチとアスペクト比から幅・高さ(m)を求める */
export function screenFromDiagonal(diagonalInch, aspect) {
  const d = Math.max(0, safe(diagonalInch)) * INCH_TO_M;
  const a = Math.max(0.01, safe(aspect, 16 / 9));
  const k = Math.sqrt(a * a + 1);
  const width = (d * a) / k;
  const height = d / k;
  return { width, height, diagonalInch: Math.max(0, safe(diagonalInch)), area: width * height };
}

/** 画面幅(m)とアスペクト比から対角インチを求める */
export function screenFromWidth(width, aspect) {
  const w = Math.max(0, safe(width));
  const a = Math.max(0.01, safe(aspect, 16 / 9));
  const height = w / a;
  const diagonalInch = Math.sqrt(w * w + height * height) / INCH_TO_M;
  return { width: w, height, diagonalInch, area: w * height };
}

/* ------------------------------------------------------------------ */
/* 投写距離とスローレシオ                                              */
/* ------------------------------------------------------------------ */

/**
 * ズーム位置(0=広角/最短、1=望遠/最長)からスローレシオを求める。
 * 単焦点レンズ（min===max）ではズーム位置に関わらず同じ値になる。
 */
export function throwRatioAtZoom(throwRatioMin, throwRatioMax, zoom) {
  const min = Math.max(0.01, safe(throwRatioMin, 1));
  const max = Math.max(min, safe(throwRatioMax, min));
  return min + (max - min) * clamp(safe(zoom), 0, 1);
}

/** スローレシオ = 投写距離 ÷ 画面の幅 */
export const widthFromDistance = (distance, throwRatio) =>
  Math.max(0, safe(distance)) / Math.max(0.01, safe(throwRatio, 1));

export const distanceFromWidth = (width, throwRatio) =>
  Math.max(0, safe(width)) * Math.max(0.01, safe(throwRatio, 1));

/* ------------------------------------------------------------------ */
/* レンズシフト・設置高さ                                              */
/* ------------------------------------------------------------------ */

/** 天吊り（上下反転）時はシフト範囲の符号が反転する */
export function shiftRangeForMounting(range, mounting) {
  const vMin = safe(range?.vMin);
  const vMax = safe(range?.vMax, vMin);
  const hMin = safe(range?.hMin);
  const hMax = safe(range?.hMax, hMin);
  if (mounting === 'ceiling') {
    return { vMin: -vMax, vMax: -vMin, hMin: -hMax, hMax: -hMin };
  }
  return { vMin, vMax, hMin, hMax };
}

/** シフト量から画面の上端・中心・下端の高さを求める */
export function screenEdges({ lensHeight, screenHeight, shiftPercent }) {
  const h = Math.max(0, safe(screenHeight));
  const center = safe(lensHeight) + (safe(shiftPercent) / 100) * h;
  return { center, bottom: center - h / 2, top: center + h / 2 };
}

/** 目標の画面下端の高さを実現するために必要なシフト量(%) */
export function requiredShiftPercent({ screenBottom, lensHeight, screenHeight }) {
  const h = safe(screenHeight);
  if (h <= 0) return 0;
  return ((safe(screenBottom) - safe(lensHeight)) / h + 0.5) * 100;
}

/** 上下方向のズレ(m)を投写距離(m)から仰角(度)に変換する（台形補正の目安） */
export function tiltAngleDeg(verticalGap, distance) {
  const d = safe(distance);
  if (d <= 0) return 0;
  return Math.atan(safe(verticalGap) / d) * RAD_TO_DEG;
}

/* ------------------------------------------------------------------ */
/* 明るさ                                                              */
/* ------------------------------------------------------------------ */

/** 環境光ごとの推奨画面輝度(fL)。SMPTE の暗室 16fL を基準に設定 */
export const AMBIENT_LEVELS = [
  { id: 'dark', label: '完全暗室', hint: '映画館に近い環境', min: 12, max: 22, ideal: 16 },
  { id: 'dim', label: '薄暗い部屋', hint: '間接照明・遮光カーテン', min: 20, max: 35, ideal: 27 },
  { id: 'bright', label: '明るい部屋', hint: '昼間・照明を点けたリビング', min: 35, max: 60, ideal: 45 },
];

export const getAmbientLevel = (id) =>
  AMBIENT_LEVELS.find((l) => l.id === id) || AMBIENT_LEVELS[0];

/**
 * 画面の明るさを計算する。
 * 照度(lx) = 光束(lm) ÷ 画面面積(m^2)
 * 輝度(cd/m^2) = 照度 × スクリーンゲイン ÷ π（完全拡散反射を仮定）
 */
export function computeBrightness({ lumens, area, screenGain = 1 }) {
  const a = safe(area);
  const gain = Math.max(0.05, safe(screenGain, 1));
  const illuminance = a > 0 ? Math.max(0, safe(lumens)) / a : 0;
  const luminance = (illuminance * gain) / Math.PI;
  return { illuminance, luminance, footLambert: luminance / CD_PER_FL, screenGain: gain };
}

/** 推奨 fL を満たすために必要なルーメン数 */
export function lumensForFootLambert({ footLambert, area, screenGain = 1 }) {
  const gain = Math.max(0.05, safe(screenGain, 1));
  return (safe(footLambert) * CD_PER_FL * Math.PI * Math.max(0, safe(area))) / gain;
}

export function evaluateBrightness(footLambert, ambientId) {
  const level = getAmbientLevel(ambientId);
  const fl = safe(footLambert);
  if (fl < level.min) {
    return { status: 'low', level, label: '暗い', message: `${level.label}の推奨 ${level.min}〜${level.max} fL を下回っています。画面を小さくするか、明るい機種を検討してください。` };
  }
  if (fl > level.max) {
    return { status: 'high', level, label: '明るすぎ', message: `${level.label}の推奨 ${level.min}〜${level.max} fL を超えています。画面を大きくするか、輝度を落とすと目が疲れにくくなります。` };
  }
  return { status: 'ok', level, label: '適正', message: `${level.label}での推奨 ${level.min}〜${level.max} fL に収まっています。` };
}

/* ------------------------------------------------------------------ */
/* 視聴距離・画質                                                      */
/* ------------------------------------------------------------------ */

/** 水平視野角(度)から視聴距離(m)を求める */
export function distanceForViewingAngle(width, angleDeg) {
  const a = clamp(safe(angleDeg, 30), 1, 170);
  return safe(width) / 2 / Math.tan(a / 2 / RAD_TO_DEG);
}

/** 現在の視聴距離での水平視野角(度) */
export function viewingAngleAt(width, distance) {
  const d = safe(distance);
  if (d <= 0) return 0;
  return 2 * Math.atan(safe(width) / 2 / d) * RAD_TO_DEG;
}

/**
 * 解像感の指標。
 * 視力1.0（分解能1分角）で画素が見分けられなくなる距離を目安として返す。
 */
export function computeImageQuality({ width, hPixels }) {
  const w = Math.max(0, safe(width));
  const px = Math.max(1, safe(hPixels, 1920));
  const widthInch = w / INCH_TO_M;
  const ppi = widthInch > 0 ? px / widthInch : 0;
  const pixelPitch = px > 0 ? w / px : 0; // m
  // 1分角 = 1/60 度。tan(1/60°) ≒ 1/3438
  const pixelInvisibleDistance = pixelPitch / Math.tan(1 / 60 / RAD_TO_DEG);
  return {
    ppi,
    pixelPitchMm: pixelPitch * 1000,
    pixelInvisibleDistance,
    recommendedTHX: distanceForViewingAngle(w, 36),
    recommendedSMPTE: distanceForViewingAngle(w, 30),
    minComfortable: distanceForViewingAngle(w, 40),
  };
}

/* ------------------------------------------------------------------ */
/* 早見表                                                              */
/* ------------------------------------------------------------------ */

/** 投写距離ごとに得られる画面サイズ（ズーム広角端〜望遠端）の一覧 */
export function buildSizeTable({ distances, throwRatioMin, throwRatioMax, aspect }) {
  return (distances || []).map((distance) => {
    const wide = screenFromWidth(widthFromDistance(distance, throwRatioMin), aspect);
    const tele = screenFromWidth(widthFromDistance(distance, throwRatioMax), aspect);
    return {
      distance,
      maxDiagonalInch: wide.diagonalInch,
      minDiagonalInch: tele.diagonalInch,
      maxWidth: wide.width,
      minWidth: tele.width,
    };
  });
}

/** 画面サイズごとに必要な投写距離（ズーム広角端〜望遠端）の一覧 */
export function buildDistanceTable({ diagonals, throwRatioMin, throwRatioMax, aspect }) {
  return (diagonals || []).map((diagonalInch) => {
    const screen = screenFromDiagonal(diagonalInch, aspect);
    return {
      diagonalInch,
      minDistance: distanceFromWidth(screen.width, throwRatioMin),
      maxDistance: distanceFromWidth(screen.width, throwRatioMax),
      width: screen.width,
      height: screen.height,
    };
  });
}

/* ------------------------------------------------------------------ */
/* 総合シミュレーション                                                */
/* ------------------------------------------------------------------ */

/**
 * 入力条件から投写結果をまとめて計算する。
 *
 * mode: 'distance' … 投写距離から画面サイズを求める
 *       'size'     … 画面サイズから必要な投写距離を求める
 */
export function simulate(input = {}) {
  const {
    mode = 'distance',
    distance: distanceInput = 3,
    diagonalInch: diagonalInput = 100,
    aspect = 16 / 9,
    throwRatioMin = 1.35,
    throwRatioMax = 2.2,
    zoom = 0,
    mounting = 'floor',
    lensHeight = 0.6,
    screenBottomTarget = 0.9,
    horizontalOffsetTarget = 0,
    shiftRange = { vMin: 0, vMax: 0, hMin: 0, hMax: 0 },
    lumens = 2500,
    screenGain = 1,
    ambient = 'dark',
    hPixels = 3840,
    vPixels = 2160,
    roomDepth = null,
    ceilingHeight = null,
    viewerDistance = null,
  } = input;

  const trMin = Math.max(0.01, safe(throwRatioMin, 1));
  const trMax = Math.max(trMin, safe(throwRatioMax, trMin));
  const throwRatio = throwRatioAtZoom(trMin, trMax, zoom);

  // --- 画面サイズと投写距離 -----------------------------------------
  let screen;
  let distance;
  if (mode === 'size') {
    screen = screenFromDiagonal(diagonalInput, aspect);
    distance = distanceFromWidth(screen.width, throwRatio);
  } else {
    distance = Math.max(0, safe(distanceInput));
    screen = screenFromWidth(widthFromDistance(distance, throwRatio), aspect);
  }

  // ズーム範囲で実現できる幅（距離指定時）／距離（サイズ指定時）
  const range = {
    minDiagonalInch: screenFromWidth(widthFromDistance(distance, trMax), aspect).diagonalInch,
    maxDiagonalInch: screenFromWidth(widthFromDistance(distance, trMin), aspect).diagonalInch,
    minDistance: distanceFromWidth(screen.width, trMin),
    maxDistance: distanceFromWidth(screen.width, trMax),
    hasZoom: trMax - trMin > 0.001,
  };

  // --- 上下方向（レンズシフト） -------------------------------------
  const effectiveShift = shiftRangeForMounting(shiftRange, mounting);
  const required = requiredShiftPercent({
    screenBottom: safe(screenBottomTarget),
    lensHeight: safe(lensHeight),
    screenHeight: screen.height,
  });
  const applied = clamp(required, effectiveShift.vMin, effectiveShift.vMax);
  const withinRange = Math.abs(required - applied) < 0.01;
  const edges = screenEdges({ lensHeight, screenHeight: screen.height, shiftPercent: applied });
  const verticalGap = ((required - applied) / 100) * screen.height;
  const tilt = tiltAngleDeg(verticalGap, distance);
  const achievableBottom = {
    min: safe(lensHeight) + (effectiveShift.vMin / 100 - 0.5) * screen.height,
    max: safe(lensHeight) + (effectiveShift.vMax / 100 - 0.5) * screen.height,
  };

  // --- 左右方向（水平シフト） ---------------------------------------
  const hRequired = screen.width > 0 ? (safe(horizontalOffsetTarget) / screen.width) * 100 : 0;
  const hApplied = clamp(hRequired, effectiveShift.hMin, effectiveShift.hMax);
  const horizontal = {
    requiredPercent: hRequired,
    appliedPercent: hApplied,
    withinRange: Math.abs(hRequired - hApplied) < 0.01,
    offset: (hApplied / 100) * screen.width,
    targetOffset: safe(horizontalOffsetTarget),
  };

  // --- 明るさ --------------------------------------------------------
  const brightness = computeBrightness({ lumens, area: screen.area, screenGain });
  const brightnessEval = evaluateBrightness(brightness.footLambert, ambient);
  const ambientLevel = getAmbientLevel(ambient);
  const recommendedLumens = {
    min: lumensForFootLambert({ footLambert: ambientLevel.min, area: screen.area, screenGain }),
    max: lumensForFootLambert({ footLambert: ambientLevel.max, area: screen.area, screenGain }),
  };

  // --- 画質・視聴距離 ------------------------------------------------
  const quality = computeImageQuality({ width: screen.width, hPixels });
  const actualViewerDistance = isFiniteNumber(viewerDistance) && viewerDistance > 0 ? viewerDistance : null;
  const viewing = {
    ...quality,
    viewerDistance: actualViewerDistance,
    viewingAngle: actualViewerDistance ? viewingAngleAt(screen.width, actualViewerDistance) : null,
  };

  // --- 警告 ----------------------------------------------------------
  const warnings = [];
  if (screen.diagonalInch < 20) {
    warnings.push({ level: 'warn', message: '画面サイズが極端に小さくなっています。投写距離やスローレシオを確認してください。' });
  }
  if (!withinRange) {
    warnings.push({
      level: 'error',
      message: `レンズシフトだけでは目標の高さに届きません（必要 ${required.toFixed(0)}% / 可能 ${effectiveShift.vMin.toFixed(0)}〜${effectiveShift.vMax.toFixed(0)}%）。約 ${Math.abs(tilt).toFixed(1)}° の傾き＝台形補正が必要になり、画質と実効解像度が落ちます。`,
    });
  }
  if (!horizontal.withinRange) {
    warnings.push({
      level: 'warn',
      message: `左右方向のシフトが不足しています（必要 ${hRequired.toFixed(0)}% / 可能 ${effectiveShift.hMin.toFixed(0)}〜${effectiveShift.hMax.toFixed(0)}%）。プロジェクターをスクリーンの中心線上に寄せてください。`,
    });
  }
  if (edges.bottom < 0) {
    warnings.push({ level: 'warn', message: '画面の下端が床より下になります。プロジェクターの位置を上げるか、シフト量を見直してください。' });
  }
  if (isFiniteNumber(ceilingHeight) && ceilingHeight > 0 && edges.top > ceilingHeight) {
    warnings.push({ level: 'error', message: `画面の上端(${edges.top.toFixed(2)}m)が天井高(${ceilingHeight.toFixed(2)}m)を超えます。` });
  }
  if (isFiniteNumber(roomDepth) && roomDepth > 0 && distance > roomDepth) {
    warnings.push({ level: 'error', message: `必要な投写距離(${distance.toFixed(2)}m)が部屋の奥行き(${roomDepth.toFixed(2)}m)を超えています。` });
  }
  if (brightnessEval.status !== 'ok') {
    warnings.push({ level: brightnessEval.status === 'low' ? 'warn' : 'info', message: brightnessEval.message });
  }
  if (actualViewerDistance && actualViewerDistance < quality.pixelInvisibleDistance) {
    warnings.push({ level: 'info', message: `視聴距離 ${actualViewerDistance.toFixed(2)}m では画素の粒状感が見える可能性があります（目安 ${quality.pixelInvisibleDistance.toFixed(2)}m 以上）。` });
  }

  return {
    mode,
    throwRatio,
    throwRatioMin: trMin,
    throwRatioMax: trMax,
    distance,
    screen,
    range,
    vertical: {
      lensHeight: safe(lensHeight),
      requiredPercent: required,
      appliedPercent: applied,
      withinRange,
      shiftRange: effectiveShift,
      edges,
      verticalGap,
      tiltAngleDeg: tilt,
      achievableBottom,
      targetBottom: safe(screenBottomTarget),
    },
    horizontal,
    brightness: { ...brightness, evaluation: brightnessEval, recommendedLumens, ambientLevel },
    viewing,
    resolution: { hPixels: safe(hPixels, 1920), vPixels: safe(vPixels, 1080) },
    room: { roomDepth, ceilingHeight },
    warnings,
  };
}
