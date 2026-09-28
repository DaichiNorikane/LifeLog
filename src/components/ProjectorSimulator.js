"use client";
import { useState, useEffect, useMemo } from 'react';
import {
  Projector, Ruler, MoveVertical, Sun, Eye, Settings2, RotateCcw,
  AlertTriangle, Info, Monitor, ArrowLeftRight, ChevronDown, ChevronUp,
  Lightbulb, Maximize2, CheckCircle,
} from 'lucide-react';
import {
  PROJECTOR_TYPES, ASPECT_RATIOS, RESOLUTIONS, SCREEN_GAINS, MOUNTINGS,
  getProjectorType, getLens, getAspect, getResolution, getScreenGain,
} from '@/data/projectors';
import {
  simulate, buildSizeTable, buildDistanceTable, throwRatioAtZoom, AMBIENT_LEVELS, clamp,
} from '@/utils/projector';

const STORAGE_KEY = 'projector-sim-v1';

const num = (value, fallback = 0) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};
const fmt = (value, digits = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '―';
  return n.toFixed(digits);
};

const DEFAULTS = {
  mode: 'distance',
  typeId: 'home-standard',
  lensId: 'std',
  customTr: { min: '1.35', max: '2.20' },
  customShift: { vMin: '0', vMax: '60', hMin: '-10', hMax: '10' },
  zoom: '0',
  distance: '3.0',
  diagonalInch: '100',
  aspectId: '16:9',
  mounting: 'floor',
  lensHeight: '0.70',
  screenBottom: '0.90',
  horizontalOffset: '0',
  lumens: '2500',
  gainId: 'matt',
  ambient: 'dark',
  resolutionId: '4k',
  roomDepth: '4.5',
  ceilingHeight: '2.4',
  viewerDistance: '3.0',
};

/* ------------------------------------------------------------------ */
/* 小さなUI部品                                                        */
/* ------------------------------------------------------------------ */

const Card = ({ title, icon, children, accent = 'var(--primary)' }) => (
  <section className="glass-panel" style={{ padding: '16px', marginBottom: '14px' }}>
    {title && (
      <h2 style={{ margin: '0 0 12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', color: accent }}>
        {icon}{title}
      </h2>
    )}
    {children}
  </section>
);

const SegmentedControl = ({ options, value, onChange, ariaLabel }) => (
  <div role="group" aria-label={ariaLabel} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
    {options.map((opt) => {
      const active = opt.id === value;
      return (
        <button
          key={opt.id}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(opt.id)}
          style={{
            flex: '1 1 auto',
            minWidth: '110px',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${active ? 'var(--primary)' : 'var(--border-subtle)'}`,
            background: active ? 'var(--primary)' : '#fff',
            color: active ? '#fff' : 'var(--text-primary)',
            fontWeight: active ? 700 : 500,
            fontSize: '0.85rem',
            cursor: 'pointer',
            transition: 'var(--transition-fast)',
          }}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

const NumberField = ({ label, value, onChange, unit, step = 0.1, min = 0, max = 20, slider = true, hint }) => (
  <div style={{ marginBottom: '14px' }}>
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
      <span>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="number"
          aria-label={label}
          value={value}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '84px', padding: '6px 8px', textAlign: 'right', fontSize: '0.9rem', fontWeight: 700 }}
        />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{unit}</span>
      </span>
    </label>
    {slider && (
      <input
        type="range"
        aria-label={`${label}スライダー`}
        min={min}
        max={max}
        step={step}
        value={num(value, min)}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', accentColor: 'var(--primary)' }}
      />
    )}
    {hint && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{hint}</div>}
  </div>
);

const SelectField = ({ label, value, onChange, options }) => (
  <div style={{ marginBottom: '14px' }}>
    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>{label}</label>
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', fontSize: '0.9rem' }}
    >
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  </div>
);

const Stat = ({ label, value, unit, sub, strong }) => (
  <div style={{ flex: '1 1 120px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{label}</div>
    <div style={{ fontSize: strong ? '1.5rem' : '1.1rem', fontWeight: 700, lineHeight: 1.2, color: strong ? 'var(--primary-dark)' : 'var(--text-primary)' }}>
      {value}
      <span style={{ fontSize: '0.75rem', fontWeight: 500, marginLeft: '3px', color: 'var(--text-secondary)' }}>{unit}</span>
    </div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
  </div>
);

/* ------------------------------------------------------------------ */
/* 作図（側面図・上面図）                                              */
/* ------------------------------------------------------------------ */

const AXIS = '#9CA3AF';
const CONE = 'rgba(59, 130, 246, 0.18)';

function SideView({ sim, mounting, ceilingHeight }) {
  const VW = 680;
  const pad = { l: 58, r: 24, t: 30, b: 42 };
  const { distance } = sim;
  const { edges, lensHeight, targetBottom, withinRange } = sim.vertical;

  const worldW = Math.max(distance * 1.12, 0.4);
  const worldH = Math.max(edges.top, lensHeight, ceilingHeight || 0, targetBottom, 0.4) * 1.14;
  // 横幅いっぱいに描いたときの高さを基準にし、縦横比は保ったまま余白を詰める
  const scaleW = (VW - pad.l - pad.r) / worldW;
  const VH = clamp(worldH * scaleW + pad.t + pad.b, 210, 420);
  const scale = Math.min(scaleW, (VH - pad.t - pad.b) / worldH);
  const px = (x) => pad.l + x * scale;
  const py = (y) => VH - pad.b - y * scale;

  const lensX = px(distance);
  const lensY = py(lensHeight);
  const floorY = py(0);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="側面図" style={{ width: '100%', height: 'auto', background: '#fff', borderRadius: 'var(--radius-sm)' }}>
      {/* 床 */}
      <line x1={pad.l - 30} y1={floorY} x2={VW - 6} y2={floorY} stroke={AXIS} strokeWidth="2" />
      <text x={VW - 8} y={floorY + 16} textAnchor="end" fontSize="11" fill={AXIS}>床</text>

      {/* 天井 */}
      {ceilingHeight > 0 && py(ceilingHeight) > pad.t - 10 && (
        <>
          <line x1={pad.l - 30} y1={py(ceilingHeight)} x2={VW - 6} y2={py(ceilingHeight)} stroke={AXIS} strokeWidth="1.5" strokeDasharray="6 4" />
          <text x={VW - 8} y={py(ceilingHeight) - 5} textAnchor="end" fontSize="11" fill={AXIS}>天井 {fmt(ceilingHeight, 2)}m</text>
        </>
      )}

      {/* 投写光 */}
      <polygon points={`${lensX},${lensY} ${px(0)},${py(edges.top)} ${px(0)},${py(edges.bottom)}`} fill={CONE} />
      <line x1={lensX} y1={lensY} x2={px(0)} y2={py(edges.top)} stroke="#3B82F6" strokeWidth="1.2" />
      <line x1={lensX} y1={lensY} x2={px(0)} y2={py(edges.bottom)} stroke="#3B82F6" strokeWidth="1.2" />

      {/* スクリーン */}
      <rect x={px(0) - 7} y={py(edges.top)} width="8" height={Math.max(2, (edges.top - edges.bottom) * scale)} fill="var(--primary)" rx="2" />
      <text x={px(0) + 6} y={py(edges.top) - 6} fontSize="11" fill="var(--primary-dark)" fontWeight="700">
        上端 {fmt(edges.top, 2)}m
      </text>
      <text x={px(0) + 6} y={py(edges.bottom) + 15} fontSize="11" fill="var(--primary-dark)" fontWeight="700">
        下端 {fmt(edges.bottom, 2)}m
      </text>

      {/* 目標の下端（シフト不足時のみ。実際の下端ラベルと重なる場合は下にずらす） */}
      {!withinRange && (
        <>
          <line x1={px(0) - 14} y1={py(targetBottom)} x2={lensX} y2={py(targetBottom)} stroke="var(--danger)" strokeWidth="1.2" strokeDasharray="5 4" />
          <text
            x={lensX - 4}
            y={Math.abs(py(targetBottom) - py(edges.bottom)) < 22
              ? py(edges.bottom) + 31 // 「下端」ラベルの直下に逃がす
              : py(targetBottom) - 5}
            textAnchor="end" fontSize="11" fill="var(--danger)"
          >
            目標の下端 {fmt(targetBottom, 2)}m
          </text>
        </>
      )}

      {/* プロジェクター本体（ラベルは投写光と重ならない左上の余白に置く） */}
      <rect x={lensX - 4} y={lensY - 13} width="46" height="26" rx="4" fill="var(--text-primary)" />
      <circle cx={lensX} cy={lensY} r="5" fill="#F59E0B" />
      <text x={8} y={18} fontSize="11" fill="var(--text-primary)" fontWeight="700">
        {mounting === 'ceiling' ? '天吊り' : '床/台に設置'}・レンズ高 {fmt(lensHeight, 2)}m
      </text>

      {/* 投写距離の寸法線 */}
      <line x1={px(0)} y1={VH - 18} x2={lensX} y2={VH - 18} stroke="var(--text-secondary)" strokeWidth="1" markerStart="url(#pjArrowS)" markerEnd="url(#pjArrowE)" />
      <text x={(px(0) + lensX) / 2} y={VH - 24} textAnchor="middle" fontSize="12" fill="var(--text-primary)" fontWeight="700">
        投写距離 {fmt(distance, 2)}m
      </text>
      <defs>
        <marker id="pjArrowE" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--text-secondary)" />
        </marker>
        <marker id="pjArrowS" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto">
          <path d="M8,0 L0,4 L8,8 z" fill="var(--text-secondary)" />
        </marker>
      </defs>
    </svg>
  );
}

function TopView({ sim }) {
  const VW = 680;
  const pad = { l: 58, r: 24, t: 20, b: 30 };
  const { distance, screen, horizontal } = sim;
  const half = screen.width / 2;

  const worldW = Math.max(distance * 1.12, 0.4);
  const worldZ = Math.max(half + Math.abs(horizontal.offset), 0.3) * 2.3;
  const scaleW = (VW - pad.l - pad.r) / worldW;
  const VH = clamp(worldZ * scaleW + pad.t + pad.b, 150, 300);
  const scale = Math.min(scaleW, (VH - pad.t - pad.b) / worldZ);
  const px = (x) => pad.l + x * scale;
  const centerY = pad.t + (VH - pad.t - pad.b) / 2;
  const pz = (z) => centerY - z * scale;

  const left = pz(horizontal.offset + half);
  const right = pz(horizontal.offset - half);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="上面図" style={{ width: '100%', height: 'auto', background: '#fff', borderRadius: 'var(--radius-sm)' }}>
      {/* 光軸 */}
      <line x1={px(0)} y1={centerY} x2={px(distance)} y2={centerY} stroke={AXIS} strokeWidth="1" strokeDasharray="5 4" />

      {/* 投写光 */}
      <polygon points={`${px(distance)},${centerY} ${px(0)},${left} ${px(0)},${right}`} fill={CONE} />
      <line x1={px(distance)} y1={centerY} x2={px(0)} y2={left} stroke="#3B82F6" strokeWidth="1.2" />
      <line x1={px(distance)} y1={centerY} x2={px(0)} y2={right} stroke="#3B82F6" strokeWidth="1.2" />

      {/* スクリーン */}
      <rect x={px(0) - 7} y={left} width="8" height={Math.max(2, Math.abs(right - left))} fill="var(--primary)" rx="2" />
      <text x={px(0) + 8} y={left - 6} fontSize="11" fill="var(--primary-dark)" fontWeight="700">
        画面幅 {fmt(screen.width * 100, 0)}cm
      </text>

      {/* プロジェクター */}
      <rect x={px(distance) - 4} y={centerY - 13} width="42" height="26" rx="4" fill="var(--text-primary)" />
      <circle cx={px(distance)} cy={centerY} r="5" fill="#F59E0B" />

      {Math.abs(horizontal.offset) > 0.005 && (
        <text x={px(distance) - 8} y={centerY + 30} textAnchor="end" fontSize="11" fill="var(--text-secondary)">
          画面中心を{horizontal.offset > 0 ? '左' : '右'}に {fmt(Math.abs(horizontal.offset) * 100, 0)}cm ずらし
        </text>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 本体                                                                */
/* ------------------------------------------------------------------ */

export default function ProjectorSimulator() {
  const [state, setState] = useState(DEFAULTS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const set = (key) => (value) => setState((s) => ({ ...s, [key]: value }));

  // 入力内容をローカルに保存して次回も同じ条件から始められるようにする
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // setState の更新関数は描画中に評価されるため、パースはここで済ませておく
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed) setState((s) => ({ ...s, ...parsed }));
    } catch {
      /* 保存データが壊れている場合は初期値のまま使う */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* プライベートモード等で保存できなくても動作に影響はない */
    }
  }, [state]);

  const type = getProjectorType(state.typeId);
  const isCustom = type.id === 'custom';
  const lens = getLens(type, state.lensId);
  const aspect = getAspect(state.aspectId).value;
  const resolution = getResolution(state.resolutionId);
  const gain = getScreenGain(state.gainId).value;

  const throwRatioMin = isCustom ? num(state.customTr.min, 1) : lens.throwRatioMin;
  const throwRatioMax = isCustom ? num(state.customTr.max, throwRatioMin) : lens.throwRatioMax;
  const shiftRange = isCustom
    ? {
      vMin: num(state.customShift.vMin), vMax: num(state.customShift.vMax),
      hMin: num(state.customShift.hMin), hMax: num(state.customShift.hMax),
    }
    : type.shift;

  const sim = useMemo(() => simulate({
    mode: state.mode,
    distance: num(state.distance, 3),
    diagonalInch: num(state.diagonalInch, 100),
    aspect,
    throwRatioMin,
    throwRatioMax,
    zoom: num(state.zoom, 0),
    mounting: state.mounting,
    lensHeight: num(state.lensHeight, 0.7),
    screenBottomTarget: num(state.screenBottom, 0.9),
    horizontalOffsetTarget: num(state.horizontalOffset, 0),
    shiftRange,
    lumens: num(state.lumens, 2000),
    screenGain: gain,
    ambient: state.ambient,
    hPixels: resolution.hPixels,
    vPixels: resolution.vPixels,
    roomDepth: num(state.roomDepth, 0) || null,
    ceilingHeight: num(state.ceilingHeight, 0) || null,
    viewerDistance: num(state.viewerDistance, 0) || null,
  }), [state, aspect, throwRatioMin, throwRatioMax, shiftRange, gain, resolution]);

  /**
   * レンズを替えるとスローレシオが変わるため、そのままでは投写距離が
   * 現実的でない画面サイズを生む（例: 超短焦点で3m→542インチ）。
   * 「距離→サイズ」モードでは今の画面サイズを保つように距離を引き直す。
   */
  const distanceKeepingSize = (trMin, trMax) => {
    const tr = throwRatioAtZoom(trMin, trMax, num(state.zoom, 0));
    return (sim.screen.width * tr).toFixed(2);
  };

  const handleTypeChange = (id) => {
    const next = getProjectorType(id);
    const nextLens = next.lenses[0];
    setState((s) => ({
      ...s,
      typeId: id,
      lensId: nextLens.id,
      lumens: String(next.lumens),
      resolutionId: next.resolution,
      distance: s.mode === 'distance' && id !== 'custom'
        ? distanceKeepingSize(nextLens.throwRatioMin, nextLens.throwRatioMax)
        : s.distance,
    }));
  };

  const handleLensChange = (id) => {
    const nextLens = getLens(type, id);
    setState((s) => ({
      ...s,
      lensId: id,
      distance: s.mode === 'distance'
        ? distanceKeepingSize(nextLens.throwRatioMin, nextLens.throwRatioMax)
        : s.distance,
    }));
  };

  const table = useMemo(() => (
    state.mode === 'distance'
      ? buildSizeTable({ distances: [1.5, 2, 2.5, 3, 3.5, 4, 5, 6], throwRatioMin, throwRatioMax, aspect })
      : buildDistanceTable({ diagonals: [60, 80, 100, 120, 150, 200], throwRatioMin, throwRatioMax, aspect })
  ), [state.mode, throwRatioMin, throwRatioMax, aspect]);

  const errors = sim.warnings.filter((w) => w.level === 'error');
  const notices = sim.warnings.filter((w) => w.level !== 'error');
  const shiftOk = sim.vertical.withinRange;

  return (
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '16px 14px 60px' }}>
      <header style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '1.4rem', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Projector size={24} color="var(--primary)" /> 投写シミュレーター
        </h1>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          レンズ・距離・設置高さから、画面サイズ／レンズシフト／明るさをまとめて確認できます。
        </p>
      </header>

      {/* ---- 結果サマリー ---- */}
      <section
        className="glass-panel"
        style={{ padding: '16px', marginBottom: '14px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', color: '#fff', border: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>画面サイズ</div>
            <div style={{ fontSize: '2.6rem', fontWeight: 800, lineHeight: 1 }}>
              {fmt(sim.screen.diagonalInch, 1)}
              <span style={{ fontSize: '1rem', marginLeft: '4px' }}>インチ</span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: '0.85rem', lineHeight: 1.6 }}>
            <div>幅 {fmt(sim.screen.width * 100, 1)} × 高さ {fmt(sim.screen.height * 100, 1)} cm</div>
            <div>投写距離 {fmt(sim.distance, 2)} m ／ スローレシオ {fmt(sim.throwRatio, 2)}</div>
          </div>
        </div>
        <div style={{ marginTop: '10px', fontSize: '0.76rem', opacity: 0.9, borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '8px' }}>
          {sim.range.hasZoom ? (
            state.mode === 'distance'
              ? `この距離ならズーム操作で ${fmt(sim.range.minDiagonalInch, 0)}〜${fmt(sim.range.maxDiagonalInch, 0)} インチまで調整できます`
              : `このサイズなら ${fmt(sim.range.minDistance, 2)}〜${fmt(sim.range.maxDistance, 2)} m の範囲に設置できます`
          ) : '単焦点レンズのため、サイズ調整は設置距離で行います'}
        </div>
      </section>

      {/* ---- エラー・注意 ---- */}
      {(errors.length > 0 || notices.length > 0) && (
        <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {errors.map((w, i) => (
            <div key={`e${i}`} style={{ display: 'flex', gap: '8px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '0.82rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> <span>{w.message}</span>
            </div>
          ))}
          {notices.map((w, i) => (
            <div key={`n${i}`} style={{ display: 'flex', gap: '8px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: '0.82rem' }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---- 図 ---- */}
      <Card title="設置イメージ" icon={<Maximize2 size={16} />}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>側面図</div>
        <SideView sim={sim} mounting={state.mounting} ceilingHeight={num(state.ceilingHeight, 0)} />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '12px 0 6px' }}>上面図</div>
        <TopView sim={sim} />
      </Card>

      {/* ---- 機種とレンズ ---- */}
      <Card title="プロジェクターの種類" icon={<Projector size={16} />}>
        <SegmentedControl
          ariaLabel="プロジェクターの種類"
          options={PROJECTOR_TYPES.map((t) => ({ id: t.id, label: t.label }))}
          value={state.typeId}
          onChange={handleTypeChange}
        />
        <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: '10px 0 12px' }}>{type.description}</p>

        {type.lenses.length > 1 && (
          <SelectField
            label="レンズ"
            value={state.lensId}
            onChange={handleLensChange}
            options={type.lenses.map((l) => ({ id: l.id, label: `${l.label}（${l.throwRatioMin.toFixed(2)}〜${l.throwRatioMax.toFixed(2)}）` }))}
          />
        )}

        {isCustom ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <NumberField
              label="スローレシオ 広角端" unit="" step={0.01} min={0.1} max={10} slider={false}
              value={state.customTr.min}
              onChange={(v) => setState((s) => ({ ...s, customTr: { ...s.customTr, min: v } }))}
            />
            <NumberField
              label="スローレシオ 望遠端" unit="" step={0.01} min={0.1} max={10} slider={false}
              value={state.customTr.max}
              onChange={(v) => setState((s) => ({ ...s, customTr: { ...s.customTr, max: v } }))}
            />
            <NumberField
              label="上下シフト下限" unit="%" step={1} min={-150} max={150} slider={false}
              value={state.customShift.vMin}
              onChange={(v) => setState((s) => ({ ...s, customShift: { ...s.customShift, vMin: v } }))}
            />
            <NumberField
              label="上下シフト上限" unit="%" step={1} min={-150} max={150} slider={false}
              value={state.customShift.vMax}
              onChange={(v) => setState((s) => ({ ...s, customShift: { ...s.customShift, vMax: v } }))}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Stat label="スローレシオ" value={`${fmt(throwRatioMin, 2)}〜${fmt(throwRatioMax, 2)}`} unit="" />
            <Stat label="上下シフト範囲" value={`${fmt(shiftRange.vMin, 0)}〜${fmt(shiftRange.vMax, 0)}`} unit="%" />
            <Stat label="左右シフト範囲" value={`${fmt(shiftRange.hMin, 0)}〜${fmt(shiftRange.hMax, 0)}`} unit="%" />
          </div>
        )}

        {sim.range.hasZoom && (
          <div style={{ marginTop: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              ズーム位置（スローレシオ {fmt(sim.throwRatio, 2)}）
            </label>
            <input
              type="range" aria-label="ズーム位置" min={0} max={1} step={0.01}
              value={num(state.zoom, 0)} onChange={(e) => set('zoom')(e.target.value)}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span>広角端（大きく写る）</span><span>望遠端（小さく写る）</span>
            </div>
          </div>
        )}
      </Card>

      {/* ---- 距離とサイズ ---- */}
      <Card title="距離と画面サイズ" icon={<Ruler size={16} />}>
        <div style={{ marginBottom: '14px' }}>
          <SegmentedControl
            ariaLabel="計算モード"
            options={[
              { id: 'distance', label: '距離 → サイズ' },
              { id: 'size', label: 'サイズ → 距離' },
            ]}
            value={state.mode}
            onChange={set('mode')}
          />
        </div>

        {state.mode === 'distance' ? (
          <NumberField label="投写距離（レンズ〜スクリーン）" value={state.distance} onChange={set('distance')} unit="m" step={0.05} min={0.2} max={15} />
        ) : (
          <NumberField label="ほしい画面サイズ（対角）" value={state.diagonalInch} onChange={set('diagonalInch')} unit="インチ" step={1} min={30} max={300} />
        )}

        <SelectField label="アスペクト比" value={state.aspectId} onChange={set('aspectId')} options={ASPECT_RATIOS} />

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Stat label="画面の幅" value={fmt(sim.screen.width * 100, 1)} unit="cm" />
          <Stat label="画面の高さ" value={fmt(sim.screen.height * 100, 1)} unit="cm" />
          <Stat label="投写面積" value={fmt(sim.screen.area, 2)} unit="m²" />
        </div>
      </Card>

      {/* ---- 設置高さ ---- */}
      <Card title="設置の高さとレンズシフト" icon={<MoveVertical size={16} />}>
        <div style={{ marginBottom: '14px' }}>
          <SegmentedControl ariaLabel="設置方法" options={MOUNTINGS} value={state.mounting} onChange={set('mounting')} />
        </div>

        <NumberField
          label={state.mounting === 'ceiling' ? 'レンズの高さ（床から／天吊り後）' : 'レンズの高さ（床から）'}
          value={state.lensHeight} onChange={set('lensHeight')} unit="m" step={0.01} min={0} max={4}
          hint={state.mounting === 'ceiling' && num(state.ceilingHeight, 0) > 0
            ? `天井から ${fmt(num(state.ceilingHeight, 0) - num(state.lensHeight, 0), 2)} m 吊り下げる計算です`
            : undefined}
        />
        <NumberField label="画面の下端をどの高さにしたいか" value={state.screenBottom} onChange={set('screenBottom')} unit="m" step={0.01} min={0} max={3} />

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <Stat label="必要な上下シフト" value={fmt(sim.vertical.requiredPercent, 0)} unit="%" />
          <Stat label="実際に適用される量" value={fmt(sim.vertical.appliedPercent, 0)} unit="%" />
          <Stat label="画面の上端" value={fmt(sim.vertical.edges.top, 2)} unit="m" />
          <Stat label="画面の下端" value={fmt(sim.vertical.edges.bottom, 2)} unit="m" />
        </div>

        <div style={{
          display: 'flex', gap: '8px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem',
          background: shiftOk ? '#ECFDF5' : '#FEF2F2',
          border: `1px solid ${shiftOk ? '#A7F3D0' : '#FECACA'}`,
          color: shiftOk ? '#065F46' : '#991B1B',
        }}>
          {shiftOk ? <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />}
          <span>
            {shiftOk
              ? 'レンズシフトの範囲内に収まります。台形補正なしで設置できます。'
              : `シフトが足りず、約 ${fmt(Math.abs(sim.vertical.tiltAngleDeg), 1)}° 本体を傾ける（台形補正する）必要があります。`}
            <br />
            この構成で画面の下端を置ける範囲: {fmt(sim.vertical.achievableBottom.min, 2)}〜{fmt(sim.vertical.achievableBottom.max, 2)} m
          </span>
        </div>

        <div style={{ marginTop: '14px' }}>
          <NumberField
            label="スクリーン中心と光軸の左右のズレ" value={state.horizontalOffset} onChange={set('horizontalOffset')}
            unit="m" step={0.05} min={-2} max={2}
            hint={`必要な左右シフト ${fmt(sim.horizontal.requiredPercent, 0)}%（可能 ${fmt(sim.vertical.shiftRange.hMin, 0)}〜${fmt(sim.vertical.shiftRange.hMax, 0)}%）`}
          />
        </div>
      </Card>

      {/* ---- 明るさ ---- */}
      <Card title="明るさ" icon={<Sun size={16} />} accent="#D97706">
        <NumberField
          label="プロジェクターの明るさ" value={state.lumens} onChange={set('lumens')} unit="lm" step={100} min={100} max={20000}
          hint="カタログ値は最も明るい画質モードの数値です。映画向けモードでは半分以下になることもあります。"
        />
        <SelectField label="スクリーンの種類（ゲイン）" value={state.gainId} onChange={set('gainId')} options={SCREEN_GAINS} />
        <SelectField
          label="部屋の明るさ" value={state.ambient} onChange={set('ambient')}
          options={AMBIENT_LEVELS.map((l) => ({ id: l.id, label: `${l.label}（${l.hint}）` }))}
        />

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <Stat label="画面輝度" value={fmt(sim.brightness.footLambert, 1)} unit="fL" strong />
          <Stat label="照度" value={fmt(sim.brightness.illuminance, 0)} unit="lx" />
          <Stat label="輝度" value={fmt(sim.brightness.luminance, 0)} unit="cd/m²" />
        </div>

        <div style={{
          display: 'flex', gap: '8px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem',
          background: sim.brightness.evaluation.status === 'ok' ? '#ECFDF5' : '#FFFBEB',
          border: `1px solid ${sim.brightness.evaluation.status === 'ok' ? '#A7F3D0' : '#FDE68A'}`,
          color: sim.brightness.evaluation.status === 'ok' ? '#065F46' : '#92400E',
        }}>
          <Lightbulb size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            <strong>{sim.brightness.evaluation.label}</strong>：{sim.brightness.evaluation.message}
            <br />
            この画面サイズなら {fmt(sim.brightness.recommendedLumens.min, 0)}〜{fmt(sim.brightness.recommendedLumens.max, 0)} lm が目安です。
          </span>
        </div>
      </Card>

      {/* ---- 画質と視聴距離 ---- */}
      <Card title="画質と視聴距離" icon={<Eye size={16} />} accent="#2563EB">
        <SelectField label="解像度" value={state.resolutionId} onChange={set('resolutionId')} options={RESOLUTIONS} />
        <NumberField label="実際の視聴距離" value={state.viewerDistance} onChange={set('viewerDistance')} unit="m" step={0.1} min={0.5} max={12} />

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Stat label="視野角" value={sim.viewing.viewingAngle ? fmt(sim.viewing.viewingAngle, 0) : '―'} unit="°" sub="THX推奨 36°" />
          <Stat label="推奨視聴距離" value={`${fmt(sim.viewing.recommendedTHX, 1)}〜${fmt(sim.viewing.recommendedSMPTE, 1)}`} unit="m" sub="THX〜SMPTE基準" />
          <Stat label="画素が見えない距離" value={fmt(sim.viewing.pixelInvisibleDistance, 1)} unit="m" sub={`${fmt(sim.viewing.ppi, 1)} ppi`} />
        </div>
      </Card>

      {/* ---- 部屋の条件 ---- */}
      <Card title="部屋の条件・早見表" icon={<Monitor size={16} />} accent="#7C3AED">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.82rem', padding: 0, marginBottom: '12px', cursor: 'pointer' }}
        >
          <Settings2 size={14} /> 部屋のサイズを入力 {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showAdvanced && (
          <div style={{ marginBottom: '8px' }}>
            <NumberField label="部屋の奥行き" value={state.roomDepth} onChange={set('roomDepth')} unit="m" step={0.1} min={1} max={20} />
            <NumberField label="天井の高さ" value={state.ceilingHeight} onChange={set('ceilingHeight')} unit="m" step={0.05} min={1.8} max={6} />
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-main)' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>{state.mode === 'distance' ? '投写距離' : '画面サイズ'}</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>{state.mode === 'distance' ? '最小（望遠端）' : '最短距離'}</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>{state.mode === 'distance' ? '最大（広角端）' : '最長距離'}</th>
              </tr>
            </thead>
            <tbody>
              {state.mode === 'distance'
                ? table.map((row) => (
                  <tr key={row.distance} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px' }}>{fmt(row.distance, 1)} m</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(row.minDiagonalInch, 0)} インチ</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(row.maxDiagonalInch, 0)} インチ</td>
                  </tr>
                ))
                : table.map((row) => (
                  <tr key={row.diagonalInch} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px' }}>{row.diagonalInch} インチ</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(row.minDistance, 2)} m</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(row.maxDistance, 2)} m</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '18px' }}>
        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6, display: 'flex', gap: '6px' }}>
          <ArrowLeftRight size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
          プリセットの数値は機種カテゴリの一般的な目安です。実際の設置前にメーカーの仕様書で確認してください。
        </p>
        <button
          type="button"
          onClick={() => setState(DEFAULTS)}
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: '#fff', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          <RotateCcw size={14} /> リセット
        </button>
      </div>
    </main>
  );
}
