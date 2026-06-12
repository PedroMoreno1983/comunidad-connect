/* src/components/cc/viz/BladeFan.tsx ────────────────────────── */
import * as React from "react";
import { fold } from "./FoldedBar";

type Blade = {
  color: string;
  value: number;
  max?: number;
  /** Pre-formatted delta like "+0.2" / "−0.4". */
  delta?: string;
};

type BladeFanProps = {
  width?: number;
  height?: number;
  origin?: { x: number; y: number };
  startAngle?: number;   // degrees from vertical, clockwise
  endAngle?: number;
  blades: Blade[];
  maxLen?: number;
  bladeWidth?: number;
  /** 0 = square tip (default), >0 = pointed. */
  tipInset?: number;
  grid?: boolean;
  gridRings?: number[];
  labels?: boolean;
};

/** Tip coordinate of a blade after rotation, with optional outward offset. */
function tipOf(origin: { x: number; y: number }, angle: number, length: number, extra = 0) {
  const a = (angle * Math.PI) / 180;
  const L = length + extra;
  return { x: origin.x + L * Math.sin(a), y: origin.y - L * Math.cos(a) };
}

/**
 * Cotton-inspired radial "blade fan" chart. Each blade is a folded ribbon
 * (light/dark spine) radiating from `origin`, length proportional to value.
 *
 *   <BladeFan
 *     width={560} height={440}
 *     origin={{ x: 70, y: 380 }}
 *     startAngle={10} endAngle={82}
 *     maxLen={300} bladeWidth={18}
 *     blades={scores.map(s => ({ color: s.color, value: s.score, max: 5, delta: s.delta }))}
 *   />
 *
 * Square tips by default (tipInset=0). Pass tipInset={12} for a pointed look.
 */
export function BladeFan({
  width = 520,
  height = 460,
  origin = { x: 90, y: 400 },
  startAngle = 8,
  endAngle = 84,
  blades,
  maxLen = 300,
  bladeWidth = 16,
  tipInset = 0,
  grid = true,
  gridRings = [1, 2, 3, 4, 5],
  labels = true,
}: BladeFanProps) {
  const n = blades.length;
  const span = endAngle - startAngle;
  const maxVal = Math.max(...blades.map((b) => b.max ?? b.value));
  const w = bladeWidth;
  const filterId = React.useId();

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <defs>
        <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1A1611" floodOpacity="0.12" />
        </filter>
      </defs>

      {/* radial grid */}
      {grid &&
        gridRings.map((ring, i) => {
          const r = (ring / Math.max(...gridRings)) * maxLen;
          const a0 = (startAngle * Math.PI) / 180;
          const a1 = (endAngle * Math.PI) / 180;
          const x0 = origin.x + r * Math.sin(a0);
          const y0 = origin.y - r * Math.cos(a0);
          const x1 = origin.x + r * Math.sin(a1);
          const y1 = origin.y - r * Math.cos(a1);
          const large = endAngle - startAngle > 180 ? 1 : 0;
          return (
            <g key={i}>
              <path d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`} fill="none" stroke="var(--cc-line)" strokeWidth="1" />
              <text x={x1 + 8} y={y1} fontFamily="var(--cc-font-mono)" fontSize="9" fill="var(--cc-ink-faint)">{ring}</text>
            </g>
          );
        })}

      {/* blades */}
      <g filter={`url(#${filterId})`}>
        {blades.map((b, i) => {
          const angle = n === 1 ? (startAngle + endAngle) / 2 : startAngle + (i / (n - 1)) * span;
          const len = (b.value / maxVal) * maxLen;
          const left = `${-w / 2},0 0,0 0,${-len} ${-w / 2},${-len + tipInset}`;
          const right = `${w / 2},0 0,0 0,${-len} ${w / 2},${-len + tipInset}`;
          return (
            <g key={i} transform={`translate(${origin.x},${origin.y}) rotate(${angle})`}>
              <polygon points={left} fill={b.color} />
              <polygon points={right} fill={fold(b.color)} />
            </g>
          );
        })}
      </g>

      {/* tip labels */}
      {labels &&
        blades.map((b, i) => {
          const angle = n === 1 ? (startAngle + endAngle) / 2 : startAngle + (i / (n - 1)) * span;
          const len = (b.value / maxVal) * maxLen;
          const tip = tipOf(origin, angle, len, 14);
          const lead = tipOf(origin, angle, len, 4);
          return (
            <g key={`l${i}`}>
              <line x1={lead.x} y1={lead.y} x2={tip.x} y2={tip.y} stroke="var(--cc-line-strong)" strokeWidth="1" />
              <text x={tip.x} y={tip.y - 4} fontFamily="var(--cc-font-display)" fontSize="18" fill="var(--cc-ink)" textAnchor="middle">
                {b.value.toFixed(2)}
              </text>
              {b.delta && (
                <text x={tip.x} y={tip.y + 9} fontFamily="var(--cc-font-mono)" fontSize="9" fill={b.delta[0] === "+" ? "var(--cc-sage)" : "var(--cc-rose)"} textAnchor="middle">
                  {b.delta}
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
}
