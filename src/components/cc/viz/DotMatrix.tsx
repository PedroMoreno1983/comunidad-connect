"use client";

type DotMatrixProps = {
  rows?: number;
  cols?: number;
  filled: number;
  color?: string;
  dotSize?: number;
  gap?: number;
};

export function DotMatrix({
  rows = 6,
  cols = 32,
  filled,
  color = "#2F6CB0",
  dotSize = 7,
  gap = 5,
}: DotMatrixProps) {
  const total = rows * cols;
  const safeFilled = Math.max(0, Math.min(filled, total));

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${dotSize}px)`, gap }}>
      {Array.from({ length: total }).map((_, index) => (
        <div
          key={index}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: 999,
            background: index < safeFilled ? color : "var(--cc-ivory-soft)",
          }}
        />
      ))}
    </div>
  );
}
