/* src/components/cc/viz/ScoreDonut.tsx ──────────────────────── */
import * as React from "react";

type ScoreDonutProps = {
  score: number;
  max?: number;
  color: string;
  size?: number;
};

/**
 * Small circular score indicator — colored arc = score/max, with a center dot.
 * Pairs with a serif number + label in a score row.
 *
 *   <ScoreDonut score={4.25} color={DATA_PALETTE.blue} />
 */
export function ScoreDonut({ score, max = 5, color, size = 38 }: ScoreDonutProps) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const frac = Math.min(score / max, 1);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cc-ivory-soft)" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${frac * c} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <circle cx={size / 2} cy={size / 2} r="3" fill={color} />
    </svg>
  );
}

type BigDonutProps = {
  value: string;
  label: string;
  sub?: string;
  color: string;
  /** 0–100 arc fill. */
  pct: number;
};

/** Larger labelled donut for demographic / adoption stats. */
export function BigDonut({ value, label, sub, color, pct }: BigDonutProps) {
  const size = 96;
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cc-ivory-soft)" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div>
        <div className="cc-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
        <div style={{ fontFamily: "var(--cc-font-display)", fontSize: 30, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--cc-ink-tertiary)", marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}
