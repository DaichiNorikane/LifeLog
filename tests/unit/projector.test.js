import { describe, it, expect } from 'vitest';
import {
  INCH_TO_M,
  clamp,
  screenFromDiagonal,
  screenFromWidth,
  throwRatioAtZoom,
  widthFromDistance,
  distanceFromWidth,
  shiftRangeForMounting,
  screenEdges,
  requiredShiftPercent,
  tiltAngleDeg,
  computeBrightness,
  lumensForFootLambert,
  evaluateBrightness,
  distanceForViewingAngle,
  viewingAngleAt,
  computeImageQuality,
  buildSizeTable,
  buildDistanceTable,
  simulate,
  AMBIENT_LEVELS,
  getAmbientLevel,
} from '@/utils/projector';

describe('projector utils', () => {
  describe('clamp', () => {
    it('制限内はそのまま、範囲外は丸める', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-3, 0, 10)).toBe(0);
      expect(clamp(30, 0, 10)).toBe(10);
    });
  });

  describe('screenFromDiagonal', () => {
    it('16:9 100インチの幅と高さを算出する', () => {
      const s = screenFromDiagonal(100, 16 / 9);
      // 100inch 16:9 → 幅約2.214m / 高さ約1.245m
      expect(s.width).toBeCloseTo(2.2136, 3);
      expect(s.height).toBeCloseTo(1.2452, 3);
      expect(s.area).toBeCloseTo(s.width * s.height, 6);
    });

    it('対角の長さが幅と高さから復元できる', () => {
      const s = screenFromDiagonal(120, 16 / 10);
      const diagonal = Math.sqrt(s.width ** 2 + s.height ** 2) / INCH_TO_M;
      expect(diagonal).toBeCloseTo(120, 6);
    });

    it('不正な入力は0扱いにする', () => {
      const s = screenFromDiagonal(NaN, 16 / 9);
      expect(s.width).toBe(0);
      expect(s.height).toBe(0);
    });
  });

  describe('screenFromWidth', () => {
    it('screenFromDiagonal と往復して一致する', () => {
      const a = screenFromDiagonal(100, 16 / 9);
      const b = screenFromWidth(a.width, 16 / 9);
      expect(b.diagonalInch).toBeCloseTo(100, 6);
      expect(b.height).toBeCloseTo(a.height, 9);
    });
  });

  describe('throwRatioAtZoom', () => {
    it('ズーム0で広角端、1で望遠端を返す', () => {
      expect(throwRatioAtZoom(1.35, 2.2, 0)).toBeCloseTo(1.35, 6);
      expect(throwRatioAtZoom(1.35, 2.2, 1)).toBeCloseTo(2.2, 6);
      expect(throwRatioAtZoom(1.35, 2.2, 0.5)).toBeCloseTo(1.775, 6);
    });

    it('範囲外のズーム値は丸める', () => {
      expect(throwRatioAtZoom(1, 2, -5)).toBeCloseTo(1, 6);
      expect(throwRatioAtZoom(1, 2, 99)).toBeCloseTo(2, 6);
    });

    it('単焦点レンズはズーム位置に関わらず一定', () => {
      expect(throwRatioAtZoom(0.25, 0.25, 0.7)).toBeCloseTo(0.25, 6);
    });
  });

  describe('widthFromDistance / distanceFromWidth', () => {
    it('スローレシオの定義どおりに相互変換できる', () => {
      const width = widthFromDistance(3, 1.5);
      expect(width).toBeCloseTo(2, 6);
      expect(distanceFromWidth(width, 1.5)).toBeCloseTo(3, 6);
    });
  });

  describe('shiftRangeForMounting', () => {
    it('床置きはそのまま', () => {
      const r = shiftRangeForMounting({ vMin: -15, vMax: 90, hMin: -25, hMax: 25 }, 'floor');
      expect(r).toEqual({ vMin: -15, vMax: 90, hMin: -25, hMax: 25 });
    });

    it('天吊りは上下が反転する', () => {
      const r = shiftRangeForMounting({ vMin: -15, vMax: 90, hMin: -25, hMax: 25 }, 'ceiling');
      expect(r.vMin).toBe(-90);
      expect(r.vMax).toBe(15);
      expect(r.hMin).toBe(-25);
      expect(r.hMax).toBe(25);
    });
  });

  describe('screenEdges', () => {
    it('シフト0ならレンズの高さが画面の中心になる', () => {
      const e = screenEdges({ lensHeight: 1, screenHeight: 1.2, shiftPercent: 0 });
      expect(e.center).toBeCloseTo(1, 6);
      expect(e.top).toBeCloseTo(1.6, 6);
      expect(e.bottom).toBeCloseTo(0.4, 6);
    });

    it('シフト+50%で画面の下端がレンズと同じ高さになる', () => {
      const e = screenEdges({ lensHeight: 0.8, screenHeight: 1.2, shiftPercent: 50 });
      expect(e.bottom).toBeCloseTo(0.8, 6);
    });
  });

  describe('requiredShiftPercent', () => {
    it('screenEdges と逆算が一致する', () => {
      const shift = requiredShiftPercent({ screenBottom: 0.9, lensHeight: 0.7, screenHeight: 1.2452 });
      const edges = screenEdges({ lensHeight: 0.7, screenHeight: 1.2452, shiftPercent: shift });
      expect(edges.bottom).toBeCloseTo(0.9, 9);
    });

    it('画面の高さが0なら0を返す', () => {
      expect(requiredShiftPercent({ screenBottom: 1, lensHeight: 0, screenHeight: 0 })).toBe(0);
    });
  });

  describe('tiltAngleDeg', () => {
    it('距離と同じズレなら45度', () => {
      expect(tiltAngleDeg(2, 2)).toBeCloseTo(45, 6);
    });

    it('距離0では0を返す', () => {
      expect(tiltAngleDeg(1, 0)).toBe(0);
    });
  });

  describe('computeBrightness', () => {
    it('照度と輝度を計算する', () => {
      const b = computeBrightness({ lumens: 2000, area: 2, screenGain: 1 });
      expect(b.illuminance).toBeCloseTo(1000, 6);
      expect(b.luminance).toBeCloseTo(1000 / Math.PI, 6);
      expect(b.footLambert).toBeCloseTo(1000 / Math.PI / 3.4262591, 5);
    });

    it('ゲインが上がると輝度も比例して上がる', () => {
      const a = computeBrightness({ lumens: 2000, area: 2, screenGain: 1 });
      const b = computeBrightness({ lumens: 2000, area: 2, screenGain: 1.5 });
      expect(b.footLambert / a.footLambert).toBeCloseTo(1.5, 6);
    });

    it('面積0では0を返す', () => {
      expect(computeBrightness({ lumens: 2000, area: 0 }).footLambert).toBe(0);
    });
  });

  describe('lumensForFootLambert', () => {
    it('computeBrightness と往復して一致する', () => {
      const lumens = lumensForFootLambert({ footLambert: 16, area: 2.75, screenGain: 1.2 });
      const back = computeBrightness({ lumens, area: 2.75, screenGain: 1.2 });
      expect(back.footLambert).toBeCloseTo(16, 6);
    });
  });

  describe('evaluateBrightness', () => {
    it('暗室基準で低い・適正・高いを判定する', () => {
      expect(evaluateBrightness(5, 'dark').status).toBe('low');
      expect(evaluateBrightness(16, 'dark').status).toBe('ok');
      expect(evaluateBrightness(50, 'dark').status).toBe('high');
    });

    it('明るい部屋では基準が上がる', () => {
      expect(evaluateBrightness(25, 'dark').status).toBe('high');
      expect(evaluateBrightness(25, 'bright').status).toBe('low');
    });

    it('未知の環境光IDは暗室扱いにフォールバックする', () => {
      expect(getAmbientLevel('unknown')).toBe(AMBIENT_LEVELS[0]);
    });
  });

  describe('viewing', () => {
    it('視野角と視聴距離が相互に一致する', () => {
      const width = 2.2136;
      const d = distanceForViewingAngle(width, 36);
      expect(viewingAngleAt(width, d)).toBeCloseTo(36, 6);
    });

    it('視聴距離0では視野角0', () => {
      expect(viewingAngleAt(2, 0)).toBe(0);
    });

    it('画素ピッチとppiを算出する', () => {
      const q = computeImageQuality({ width: 2.2136, hPixels: 3840 });
      expect(q.ppi).toBeCloseTo(3840 / (2.2136 / INCH_TO_M), 4);
      expect(q.pixelPitchMm).toBeCloseTo((2.2136 / 3840) * 1000, 6);
      expect(q.pixelInvisibleDistance).toBeGreaterThan(0);
      // 高解像度ほど近づいても画素が見えない
      const fhd = computeImageQuality({ width: 2.2136, hPixels: 1920 });
      expect(q.pixelInvisibleDistance).toBeLessThan(fhd.pixelInvisibleDistance);
    });
  });

  describe('早見表', () => {
    it('距離ごとの最大・最小サイズを返す', () => {
      const rows = buildSizeTable({ distances: [2, 3], throwRatioMin: 1.35, throwRatioMax: 2.2, aspect: 16 / 9 });
      expect(rows).toHaveLength(2);
      rows.forEach((row) => {
        expect(row.maxDiagonalInch).toBeGreaterThan(row.minDiagonalInch);
      });
      expect(rows[1].maxDiagonalInch).toBeGreaterThan(rows[0].maxDiagonalInch);
    });

    it('サイズごとの設置可能距離を返す', () => {
      const rows = buildDistanceTable({ diagonals: [100], throwRatioMin: 1.35, throwRatioMax: 2.2, aspect: 16 / 9 });
      expect(rows[0].minDistance).toBeCloseTo(2.2136 * 1.35, 2);
      expect(rows[0].maxDistance).toBeCloseTo(2.2136 * 2.2, 2);
    });

    it('入力が無い場合は空配列', () => {
      expect(buildSizeTable({})).toEqual([]);
      expect(buildDistanceTable({})).toEqual([]);
    });
  });

  describe('simulate', () => {
    const base = {
      mode: 'distance',
      distance: 3,
      aspect: 16 / 9,
      throwRatioMin: 1.35,
      throwRatioMax: 2.2,
      zoom: 0,
      mounting: 'floor',
      lensHeight: 0.7,
      screenBottomTarget: 0.9,
      shiftRange: { vMin: -15, vMax: 90, hMin: -25, hMax: 25 },
      lumens: 2500,
      screenGain: 1,
      ambient: 'dark',
      hPixels: 3840,
      vPixels: 2160,
    };

    it('距離モードで画面サイズを求める', () => {
      const r = simulate(base);
      expect(r.screen.width).toBeCloseTo(3 / 1.35, 6);
      expect(r.distance).toBe(3);
      expect(r.throwRatio).toBeCloseTo(1.35, 6);
    });

    it('サイズモードで必要距離を求める（距離モードと整合する）', () => {
      const sizeMode = simulate({ ...base, mode: 'size', diagonalInch: 100 });
      expect(sizeMode.distance).toBeCloseTo(2.2136 * 1.35, 3);
      const back = simulate({ ...base, distance: sizeMode.distance });
      expect(back.screen.diagonalInch).toBeCloseTo(100, 3);
    });

    it('ズーム範囲から最大・最小サイズを返す', () => {
      const r = simulate(base);
      expect(r.range.hasZoom).toBe(true);
      expect(r.range.maxDiagonalInch).toBeGreaterThan(r.range.minDiagonalInch);
    });

    it('単焦点レンズでは hasZoom が false', () => {
      const r = simulate({ ...base, throwRatioMin: 0.25, throwRatioMax: 0.25 });
      expect(r.range.hasZoom).toBe(false);
    });

    it('シフト範囲内なら台形補正が不要と判定する', () => {
      const r = simulate(base);
      expect(r.vertical.withinRange).toBe(true);
      expect(r.vertical.edges.bottom).toBeCloseTo(0.9, 6);
      expect(r.vertical.tiltAngleDeg).toBeCloseTo(0, 6);
      expect(r.warnings.some((w) => w.level === 'error')).toBe(false);
    });

    it('シフト範囲外なら必要な傾き角とエラーを返す', () => {
      const r = simulate({
        ...base,
        shiftRange: { vMin: 0, vMax: 0, hMin: 0, hMax: 0 },
        screenBottomTarget: 2.0,
      });
      expect(r.vertical.withinRange).toBe(false);
      expect(Math.abs(r.vertical.tiltAngleDeg)).toBeGreaterThan(0);
      expect(r.warnings.some((w) => w.level === 'error')).toBe(true);
    });

    it('天吊りではシフト範囲が反転する', () => {
      const r = simulate({ ...base, mounting: 'ceiling' });
      expect(r.vertical.shiftRange.vMin).toBe(-90);
      expect(r.vertical.shiftRange.vMax).toBe(15);
    });

    it('画面の下端を置ける範囲を返す', () => {
      const r = simulate(base);
      expect(r.vertical.achievableBottom.min).toBeLessThanOrEqual(0.9);
      expect(r.vertical.achievableBottom.max).toBeGreaterThanOrEqual(0.9);
    });

    it('部屋の奥行きを超える場合に警告する', () => {
      const r = simulate({ ...base, mode: 'size', diagonalInch: 200, roomDepth: 3 });
      expect(r.warnings.some((w) => w.message.includes('奥行き'))).toBe(true);
    });

    it('天井高を超える場合に警告する', () => {
      const r = simulate({ ...base, screenBottomTarget: 1.8, ceilingHeight: 2.4 });
      expect(r.warnings.some((w) => w.message.includes('天井高'))).toBe(true);
    });

    it('画面が大きすぎると暗さを警告する', () => {
      const r = simulate({ ...base, mode: 'size', diagonalInch: 250, lumens: 800 });
      expect(r.brightness.evaluation.status).toBe('low');
      expect(r.warnings.some((w) => w.level === 'warn')).toBe(true);
    });

    it('左右シフトが不足する場合に警告する', () => {
      const r = simulate({ ...base, horizontalOffsetTarget: 1.5 });
      expect(r.horizontal.withinRange).toBe(false);
      expect(r.warnings.some((w) => w.message.includes('左右方向'))).toBe(true);
    });

    it('左右シフトが範囲内なら指定どおりのズレになる', () => {
      const r = simulate({ ...base, horizontalOffsetTarget: 0.3 });
      expect(r.horizontal.withinRange).toBe(true);
      expect(r.horizontal.offset).toBeCloseTo(0.3, 6);
    });

    it('推奨ルーメンの範囲を返す', () => {
      const r = simulate(base);
      expect(r.brightness.recommendedLumens.max).toBeGreaterThan(r.brightness.recommendedLumens.min);
    });

    it('視聴距離を渡すと視野角を返す', () => {
      const r = simulate({ ...base, viewerDistance: 3 });
      expect(r.viewing.viewingAngle).toBeGreaterThan(0);
    });

    it('視聴距離が未指定なら視野角は null', () => {
      const r = simulate(base);
      expect(r.viewing.viewingAngle).toBeNull();
    });

    it('引数なしでも既定値で計算できる', () => {
      const r = simulate();
      expect(r.screen.diagonalInch).toBeGreaterThan(0);
      expect(r.distance).toBeGreaterThan(0);
    });
  });
});
