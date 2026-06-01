/* src/components/cc/viz/DotMatrix.tsx ───────────────────────── */
import * as React from "react";

type DotMatrixProps = {
  rows?: number;
  cols?: number;
  /** How many dots are "on" (filled with color); the rest are faint. */
  filled: number;
  color?: string;
  dotSize?: number;
  gap?: number;
};

/**
 * Unit/quantity chart — a grid of small dots, `filled` of them colored.
 * Great for "186 of 192 units occupied" style stats.
 *
 *   <DotMatrix rows={6} cols={32} filled={186} color={DATA_PALETTE.blue} />
 */
export function DotMatrix({
  rows = 6,
  cols = 32,
  filled,
  color = "#2F6CB0",
  dotSize = 7,
  gap = 5,
}: DotMatrixProps) {
  const total = rows * cols;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: 999,
            background: i < filled ? color : "var(--cc-ivory-soft)",
          }}
        />
      ))}
    </div>
  );
}
