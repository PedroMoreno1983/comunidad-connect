/* src/components/cc/viz/FoldedBar.tsx ───────────────────────── */
import * as React from "react";

/** Darken a hex color toward black by factor (0–1) → rgb() string. */
export function fold(hex: string, f = 0.66): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

/** Warm color ramp used across Convive charts (Cotton-inspired data palette). */
export const DATA_PALETTE = {
  blue: "#2F6CB0",
  green: "#3E8E57",
  red: "#C24A3E",
  yellow: "#E0B23C",
  orange: "#D27A38",
  purple: "#7C6BA6",
  lime: "#93A23E",
  teal: "#3E8E8E",
  copper: "#B5664E",
} as const;

type FoldedBarProps = {
  /** 0–100 fill (vertical: bar height pct; horizontal: width pct). */
  pct: number;
  color: string;
  orientation?: "vertical" | "horizontal";
  /** px thickness of the bar (height for horizontal, width handled by parent for vertical). */
  thickness?: number;
  rounded?: number;
  className?: string;
};

/**
 * The signature Convive bar: a folded ribbon split into a lighter and darker
 * half down its spine, giving a subtle 3D fold (Cotton aesthetic).
 *
 * Vertical (chart column):
 *   <div style={{ height: 170, width: "60%" }}>
 *     <FoldedBar pct={92} color={DATA_PALETTE.copper} orientation="vertical" />
 *   </div>
 *
 * Horizontal (progress):
 *   <FoldedBar pct={86} color={DATA_PALETTE.blue} orientation="horizontal" thickness={8} />
 */
export function FoldedBar({
  pct,
  color,
  orientation = "vertical",
  thickness = 8,
  rounded = 3,
  className = "",
}: FoldedBarProps) {
  if (orientation === "horizontal") {
    return (
      <div
        className={className}
        style={{ height: thickness, background: "var(--cc-paper-warm)", borderRadius: 999, overflow: "hidden" }}
      >
        <div style={{ height: "100%", width: `${pct}%`, display: "flex", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: "50%", height: "100%", background: color }} />
          <div style={{ width: "50%", height: "100%", background: fold(color) }} />
        </div>
      </div>
    );
  }

  // vertical — parent controls width & track height
  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: `${pct}%`,
        display: "flex",
        borderRadius: `${rounded}px ${rounded}px 0 0`,
        overflow: "hidden",
        boxShadow: "0 2px 6px -2px rgba(26,22,17,0.18)",
      }}
    >
      <div style={{ width: "50%", height: "100%", background: color }} />
      <div style={{ width: "50%", height: "100%", background: fold(color) }} />
    </div>
  );
}
