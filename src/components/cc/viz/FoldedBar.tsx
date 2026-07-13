"use client";

export function fold(hex: string, factor = 0.66): string {
  const value = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((value >> 16) & 255) * factor);
  const g = Math.round(((value >> 8) & 255) * factor);
  const b = Math.round((value & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

export const DATA_PALETTE = {
  blue: "#2F6CB0",
  green: "#3E8E57",
  red: "#C24A3E",
  yellow: "#E0B23C",
  orange: "#D27A38",
  purple: "#7C6BA6",
  lime: "#93A23E",
  teal: "#3E8E8E",
  copper: "#9C5636",
} as const;

type FoldedBarProps = {
  pct: number;
  color: string;
  orientation?: "vertical" | "horizontal";
  thickness?: number;
  rounded?: number;
  className?: string;
  trackClassName?: string;
};

export function FoldedBar({
  pct,
  color,
  orientation = "vertical",
  thickness = 8,
  rounded = 3,
  className = "",
  trackClassName = "",
}: FoldedBarProps) {
  const safePct = Math.max(0, Math.min(100, pct));

  if (orientation === "horizontal") {
    return (
      <div
        className={trackClassName}
        style={{
          height: thickness,
          background: "var(--cc-paper-warm)",
          borderRadius: `0 ${rounded}px ${rounded}px 0`,
          overflow: "hidden",
        }}
      >
        <div
          className={className}
          style={{
            height: "100%",
            width: `${safePct}%`,
            display: "flex",
            borderRadius: `0 ${rounded}px ${rounded}px 0`,
            overflow: "hidden",
          }}
        >
          <div style={{ width: "50%", height: "100%", background: color }} />
          <div style={{ width: "50%", height: "100%", background: fold(color) }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: `${safePct}%`,
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
